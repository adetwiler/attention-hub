// The migration runner. This is the piece that has to keep working against
// databases on other people's machines, which is the worst possible place to
// find out it does not.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { loadTs, NO_TS } from "./_ts.mjs";

const mod = await loadTs("src/lib/migrate.ts");

describe("runMigrations", { skip: mod === null ? NO_TS : false }, () => {
  const { MIGRATIONS, runMigrations } = mod ?? {};

  /** A throwaway database on disk, because :memory: hides file-level behaviour. */
  function freshDb(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-test-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const db = new Database(path.join(dir, "hub.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    t.after(() => db.close());
    return db;
  }

  test("a fresh install lands the full v1 schema", (t) => {
    const db = freshDb(t);
    runMigrations(db);

    assert.equal(db.pragma("user_version", { simple: true }), MIGRATIONS.length);

    const columns = db.pragma("table_info(action_ledger)").map((c) => c.name);
    for (const expected of [
      "id", "actor", "verb", "target", "commits", "undoable", "artifacts",
      "state", "note", "job", "pid", "transcript", "route",
      "created_at", "started_at", "ended_at",
    ]) {
      assert.ok(columns.includes(expected), `missing column ${expected}`);
    }
  });

  test("every state in the enum is accepted and nothing else is", (t) => {
    const db = freshDb(t);
    runMigrations(db);
    const insert = db.prepare(
      "INSERT INTO action_ledger (verb, target, state) VALUES ('test', 'target', ?)",
    );
    for (const state of ["queued", "running", "done", "failed", "canceled", "needs-answer", "undone"]) {
      assert.doesNotThrow(() => insert.run(state), state);
    }
    assert.throws(() => insert.run("invented"), /CHECK constraint/);
  });

  test("re-running is a no-op", (t) => {
    const db = freshDb(t);
    runMigrations(db);
    db.prepare("INSERT INTO action_ledger (verb, target) VALUES ('keep', 'me')").run();
    runMigrations(db);
    runMigrations(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM action_ledger").get().n, 1);
    assert.equal(db.pragma("user_version", { simple: true }), MIGRATIONS.length);
  });

  test("an appended migration applies to an existing database", (t) => {
    const db = freshDb(t);
    runMigrations(db);
    db.prepare("INSERT INTO action_ledger (verb, target) VALUES ('before', 'upgrade')").run();

    const next = [...MIGRATIONS, "CREATE TABLE hub_test_note (id INTEGER PRIMARY KEY, body TEXT);"];
    runMigrations(db, next);

    assert.equal(db.pragma("user_version", { simple: true }), next.length);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM action_ledger").get().n, 1);
    assert.doesNotThrow(() => db.prepare("SELECT * FROM hub_test_note").all());
  });

  test("a failing migration leaves the version where it was", (t) => {
    const db = freshDb(t);
    runMigrations(db);
    const broken = [...MIGRATIONS, "CREATE TABLE ok_so_far (id INTEGER); THIS IS NOT SQL;"];
    assert.throws(() => runMigrations(db, broken));
    assert.equal(db.pragma("user_version", { simple: true }), MIGRATIONS.length);
    assert.throws(() => db.prepare("SELECT * FROM ok_so_far").all());
  });

  // THE REGRESSION THIS FILE EXISTS FOR. The schema comment tells the next
  // author to grow the state enum by create-new / INSERT-SELECT / DROP / RENAME.
  // With foreign keys ON and each migration inside a transaction, that dies on
  // "FOREIGN KEY constraint failed" the moment a second table references the
  // ledger, because PRAGMA foreign_keys is a no-op inside a transaction.
  test("the prescribed rebuild works with a child table referencing the ledger", (t) => {
    const db = freshDb(t);
    runMigrations(db);

    const withChild = [
      ...MIGRATIONS,
      `CREATE TABLE ledger_note (
         id INTEGER PRIMARY KEY,
         ledger_id INTEGER NOT NULL REFERENCES action_ledger(id),
         body TEXT NOT NULL
       );`,
    ];
    runMigrations(db, withChild);
    db.prepare("INSERT INTO action_ledger (id, verb, target) VALUES (1, 'run', 'thing')").run();
    db.prepare("INSERT INTO ledger_note (ledger_id, body) VALUES (1, 'a note')").run();

    const rebuild = [
      ...withChild,
      `CREATE TABLE action_ledger_new (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         actor      TEXT NOT NULL DEFAULT 'you',
         verb       TEXT NOT NULL,
         target     TEXT NOT NULL,
         commits    TEXT NOT NULL DEFAULT '[]',
         undoable   INTEGER NOT NULL DEFAULT 0 CHECK (undoable IN (0, 1)),
         artifacts  TEXT NOT NULL DEFAULT '[]',
         state      TEXT NOT NULL DEFAULT 'queued'
                    CHECK (state IN ('queued', 'running', 'done', 'failed', 'canceled', 'needs-answer', 'undone', 'paused')),
         note       TEXT,
         job        TEXT,
         pid        INTEGER,
         transcript TEXT,
         route      TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         started_at TEXT,
         ended_at   TEXT
       );
       INSERT INTO action_ledger_new SELECT * FROM action_ledger;
       DROP TABLE action_ledger;
       ALTER TABLE action_ledger_new RENAME TO action_ledger;`,
    ];

    assert.doesNotThrow(() => runMigrations(db, rebuild));
    assert.equal(db.pragma("user_version", { simple: true }), rebuild.length);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger_note").get().n, 1);
    // The new enum value is live, and foreign keys are back ON afterwards.
    assert.doesNotThrow(() =>
      db.prepare("INSERT INTO action_ledger (verb, target, state) VALUES ('x', 'y', 'paused')").run(),
    );
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  });

  test("a rebuild that orphans a reference fails loudly instead of shipping", (t) => {
    const db = freshDb(t);
    const withChild = [
      ...MIGRATIONS,
      `CREATE TABLE ledger_note (
         id INTEGER PRIMARY KEY,
         ledger_id INTEGER NOT NULL REFERENCES action_ledger(id),
         body TEXT NOT NULL
       );`,
    ];
    runMigrations(db, withChild);
    db.prepare("INSERT INTO action_ledger (id, verb, target) VALUES (1, 'run', 'thing')").run();
    db.prepare("INSERT INTO ledger_note (ledger_id, body) VALUES (1, 'a note')").run();

    // A rebuild that forgets to copy the rows across. Without the
    // foreign_key_check this returns happily and the database is broken.
    const careless = [
      ...withChild,
      `CREATE TABLE action_ledger_new (id INTEGER PRIMARY KEY AUTOINCREMENT, verb TEXT, target TEXT);
       DROP TABLE action_ledger;
       ALTER TABLE action_ledger_new RENAME TO action_ledger;`,
    ];
    assert.throws(() => runMigrations(db, careless), /orphaned reference/);
  });
});
