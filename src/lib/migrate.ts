// The migration runner and the schema it applies.
//
// It lives in its own file, apart from src/lib/db.ts, for two reasons. It is the
// one piece of this product that has to keep working against databases in the
// wild, so it earns a unit test (test/migrations.test.mjs), and this file
// imports nothing but a TYPE, so a test can load it without booting the app's
// config or its module graph.
//
// THE INDEX IN THE MIGRATIONS ARRAY IS THE VERSION. PRAGMA user_version records
// the last applied index plus one.
//
// THREE RULES, all learned expensively:
//
//   NEVER EDIT AN APPLIED MIGRATION. This app will have installs in the wild.
//   Editing a string that has already run makes those databases silently
//   diverge from the code. Append a new migration instead, always.
//
//   SQLITE CANNOT ALTER A CHECK CONSTRAINT. Growing the state enum later means
//   create-new-table, INSERT-SELECT, DROP, RENAME, preserving explicit ids so
//   sqlite_sequence follows and no id is ever reused. That is why migration 0
//   below declares the FULL v1 column set and the FULL state enum, including
//   the columns no slice uses yet.
//
//   PRAGMA foreign_keys IS A NO-OP INSIDE A TRANSACTION. This one nearly
//   shipped as a trap for whoever wrote migration 1. getDb() turns foreign keys
//   ON, and each migration used to run inside db.transaction(), so the moment a
//   second table referenced action_ledger the rebuild dance the rule above
//   prescribes would DROP the parent and die on "FOREIGN KEY constraint
//   failed". PRAGMA defer_foreign_keys does not rescue it either (both verified
//   against the installed better-sqlite3). The only thing that works is turning
//   foreign keys off OUTSIDE the transaction, which is what runMigrations does,
//   followed by a foreign_key_check so a rebuild that orphans a reference fails
//   loudly instead of shipping a silently broken database.
import type Database from "better-sqlite3";

export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE action_ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor      TEXT NOT NULL DEFAULT 'you',
    verb       TEXT NOT NULL,
    target     TEXT NOT NULL,
    commits    TEXT NOT NULL DEFAULT '[]',
    undoable   INTEGER NOT NULL DEFAULT 0 CHECK (undoable IN (0, 1)),
    artifacts  TEXT NOT NULL DEFAULT '[]',
    state      TEXT NOT NULL DEFAULT 'queued'
               CHECK (state IN ('queued', 'running', 'done', 'failed', 'canceled', 'needs-answer', 'undone')),
    note       TEXT,
    job        TEXT,
    pid        INTEGER,
    transcript TEXT,
    route      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    ended_at   TEXT
  );
  CREATE INDEX idx_ledger_state ON action_ledger (state);
  CREATE INDEX idx_ledger_target ON action_ledger (target);
  CREATE INDEX idx_ledger_created ON action_ledger (created_at);`,

  // 1: live state that is not registry. See src/lib/settings.ts for why this is
  // one key-value table and not a column per feature. Quiet hours is its first
  // tenant (quiet.manual, quiet.start, quiet.end) and it works with zero rows,
  // so this migration adds a capability and changes no behaviour on its own.
  `CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 2: THE BROWSER PANE's handshake. The hub mints a single-use, short-lived row
  // here and the sidecar (chrome/server.mjs) burns it on connect, so one
  // database is the single source of truth for what was granted and restarting
  // either side cannot desynchronise them.
  //
  // THE GRANT LIVES IN THE ROW, NEVER IN THE URL. `profile` says which browser
  // the socket may drive, so a token that leaks out of a URL bar or a log
  // cannot be re-pointed at a different signed-in profile.
  //
  // Deliberately absent: any record of what was BROWSED. The ledger records
  // that a pane was opened on a profile and nothing else. A history table here
  // would be a tracking log of the user's own machine, which is the one thing
  // this product promises never to keep.
  //
  // This was authored as index 1 in a parallel worktree, at the same time as the
  // settings table above was authored as index 1 in another. The index IS the
  // version, so the second to merge gets renumbered, and that is only safe
  // because nothing has shipped. See docs/claude/parallel-agent-builds.md.
  `CREATE TABLE browser_tokens (
    token      TEXT PRIMARY KEY,
    profile    TEXT NOT NULL,
    pane       TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );`,
];

/** One row of PRAGMA foreign_key_check: a reference with no parent. */
interface ForeignKeyViolation {
  table: string;
  rowid: number | null;
}

/**
 * Bring a database up to the current schema version. Idempotent: running it on
 * an up-to-date database does nothing.
 *
 * @param db an open connection
 * @param migrations defaults to MIGRATIONS; a test passes its own
 */
export function runMigrations(db: Database.Database, migrations: readonly string[] = MIGRATIONS): void {
  const row: unknown = db.pragma("user_version", { simple: true });
  let version = typeof row === "number" ? row : 0;
  if (version >= migrations.length) return;

  // OUTSIDE the transaction. See the header: this is the only place it works.
  const wasOn = db.pragma("foreign_keys", { simple: true }) === 1;
  if (wasOn) db.pragma("foreign_keys = OFF");

  try {
    while (version < migrations.length) {
      const sql = migrations[version];
      if (sql === undefined) break; // noUncheckedIndexedAccess earning its keep
      const at = version;
      // The bump rides inside the same transaction, so a crash mid-migration
      // leaves the database exactly at the previous version.
      db.transaction(() => {
        db.exec(sql);
        db.pragma(`user_version = ${at + 1}`);
      })();
      version += 1;
    }

    // Foreign keys were off, so nothing above was checked as it ran. Check now,
    // before anything is allowed to use the database.
    const violations = db.pragma("foreign_key_check") as ForeignKeyViolation[];
    if (violations.length > 0) {
      const where = violations.map((v) => `${v.table} rowid ${v.rowid ?? "?"}`).join(", ");
      throw new Error(
        `migration left ${violations.length} orphaned reference(s): ${where}. ` +
          "The database is at the new version but its data is inconsistent.",
      );
    }
  } finally {
    if (wasOn) db.pragma("foreign_keys = ON");
  }
}
