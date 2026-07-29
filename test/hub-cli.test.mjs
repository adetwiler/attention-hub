// The hub CLI, driven as a real process, and checked AGAINST THE APP.
//
// Why this suite is shaped like this: the CLI cannot import the TypeScript
// loader or the TypeScript contract, because it has to run on Node 20 where a
// .ts import simply fails. So "where is the feed" and "is this answered" are
// each implemented twice on purpose, and two implementations of one rule drift
// unless something checks. This is that something. The same pattern, and the
// same reason, as test/serve-config.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, NO_TS } from "./_ts.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const feedLib = await loadTs("src/lib/feed.ts");
const configLib = await loadTs("src/lib/config.ts");

/** A throwaway hub root holding just the CLI, so nothing here can touch the real
 * feed of whoever is running the tests. */
function hubRoot(t, config = null) {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "scripts"));
  cpSync(path.join(repoRoot, "scripts", "hub.mjs"), path.join(dir, "scripts", "hub.mjs"));
  if (config !== null) writeFileSync(path.join(dir, "hub.config.json"), JSON.stringify(config));
  return dir;
}

/** Run the CLI. Returns the exit code and BOTH streams, and never throws,
 * because the exit codes ARE part of the contract and every one of them is
 * asserted here. spawnSync rather than execFileSync: the latter discards stderr
 * on a zero exit, and the split between the two streams is itself a promise this
 * tool makes (the id on stdout, the sentence for the human on stderr). */
function hub(dir, args) {
  const res = spawnSync(process.execPath, [path.join(dir, "scripts", "hub.mjs"), ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

describe("the hub CLI", () => {
  test("ask files an item and prints ONLY its id on stdout", (t) => {
    const dir = hubRoot(t);
    const res = hub(dir, ["ask", "Ship it?", "--option", "yes", "--option", "no", "--from", "a test"]);
    assert.equal(res.code, 0);
    const id = res.stdout.trim();
    assert.match(id, /^q-\d{8}-[0-9a-z]{5}$/, "the id is the only thing on stdout, so $(hub ask) works");
    assert.match(res.stderr, /filed/, "the human sentence goes to stderr");

    const row = JSON.parse(readFileSync(path.join(dir, "data", "attention.jsonl"), "utf8").trim());
    assert.equal(row.id, id);
    assert.equal(row.kind, "agent-question");
    assert.deepEqual(row.options, ["yes", "no"]);
    assert.equal(row.from, "a test");
  });

  test("a statement with no options is filed as a REPORT, not as a question", (t) => {
    const dir = hubRoot(t);
    const id = hub(dir, ["ask", "The nightly run went red"]).stdout.trim();
    const row = JSON.parse(readFileSync(path.join(dir, "data", "attention.jsonl"), "utf8").trim());
    assert.equal(row.id, id);
    assert.equal(row.kind, "agent-notice");
  });

  test("review files a review ask, and refuses options it cannot honour", (t) => {
    const dir = hubRoot(t);
    const id = hub(dir, ["review", "Look at the migration", "--link", "notes/m.md"]).stdout.trim();
    assert.match(id, /^r-/);
    const row = JSON.parse(readFileSync(path.join(dir, "data", "attention.jsonl"), "utf8").trim());
    assert.equal(row.kind, "review-ask");
    assert.equal(row.link, "notes/m.md");

    const refused = hub(dir, ["review", "Look again", "--option", "yes"]);
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /mark handled/);
  });

  test("get exits 3 while waiting, 0 once answered, and prints the answer alone", (t) => {
    const dir = hubRoot(t);
    const id = hub(dir, ["ask", "Ship it?"]).stdout.trim();

    const waiting = hub(dir, ["get", id]);
    assert.equal(waiting.code, 3);
    assert.equal(waiting.stdout.trim(), "", "nothing on stdout means nothing to read yet");

    // The answer is an APPEND, exactly as the hub writes it. No row is rewritten.
    const feed = path.join(dir, "data", "attention.jsonl");
    const before = readFileSync(feed, "utf8");
    writeFileSync(feed, before + JSON.stringify({ id, at: new Date().toISOString(), answer: "yes, ship" }) + "\n");
    assert.ok(readFileSync(feed, "utf8").startsWith(before), "the original line is untouched");

    const answered = hub(dir, ["get", id]);
    assert.equal(answered.code, 0);
    assert.equal(answered.stdout.trim(), "yes, ship");
  });

  test("get on an id that was never filed exits 4", (t) => {
    const dir = hubRoot(t);
    const res = hub(dir, ["get", "q-19700101-00000"]);
    assert.equal(res.code, 4);
    assert.match(res.stderr, /no item with id/);
  });

  test("--json reports the whole record, waiting or answered", (t) => {
    const dir = hubRoot(t);
    const id = hub(dir, ["ask", "Pick one", "--option", "a", "--option", "b"]).stdout.trim();
    const res = hub(dir, ["get", id, "--json"]);
    assert.equal(res.code, 3);
    const record = JSON.parse(res.stdout);
    assert.equal(record.state, "waiting");
    assert.equal(record.answer, null);
    assert.deepEqual(record.options, ["a", "b"]);
  });

  test("--wait times out as still waiting rather than as success", (t) => {
    const dir = hubRoot(t);
    const id = hub(dir, ["ask", "Ship it?"]).stdout.trim();
    const res = hub(dir, ["get", id, "--wait", "1"]);
    assert.equal(res.code, 3, "a timeout is not an answer");
  });

  test("no arguments prints the usage and exits 2", (t) => {
    const dir = hubRoot(t);
    const res = hub(dir, []);
    assert.equal(res.code, 2);
    assert.match(res.stdout, /hub ask/);
  });

  test("an unknown verb prints the usage rather than a shrug", (t) => {
    const dir = hubRoot(t);
    const res = hub(dir, ["frobnicate"]);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /unknown command "frobnicate"/);
  });

  test("a torn last line does not stop the CLI reading the rows above it", (t) => {
    const dir = hubRoot(t);
    const id = hub(dir, ["ask", "Ship it?"]).stdout.trim();
    const feed = path.join(dir, "data", "attention.jsonl");
    writeFileSync(feed, readFileSync(feed, "utf8") + '{"id":"half","ask":"writ');
    const res = hub(dir, ["get", id]);
    assert.equal(res.code, 3, "the item is still found");
    assert.doesNotMatch(res.stderr, /warning/, "a half written last line is normal, not a warning");
  });

  // ------------------------------------------------------------------ agreement

  test(
    "the CLI and the app agree on WHERE the feed is, including a configured path",
    { skip: configLib === null ? NO_TS : false },
    (t) => {
      const cwd = process.cwd();
      t.after(() => process.chdir(cwd));

      for (const config of [null, { dataDir: "elsewhere" }, { attention: { feed: "custom/feed.jsonl" } }]) {
        const dir = hubRoot(t, config);
        // The app resolves relative paths against its working directory, which is
        // the hub root, so the comparison has to stand in the same place.
        process.chdir(dir);
        configLib.resetConfigCache();
        const fromApp = configLib.loadConfig().attention.feed;
        const fromCli = hub(dir, ["feed"]).stdout.trim();
        assert.equal(
          fromCli,
          fromApp,
          `the two resolvers disagree for ${JSON.stringify(config)}, which would mean the CLI writes where the hub is not looking`,
        );
      }
      process.chdir(cwd);
      configLib.resetConfigCache();
    },
  );

  test(
    "the CLI and the contract agree on what counts as ANSWERED",
    { skip: feedLib === null ? NO_TS : false },
    (t) => {
      const dir = hubRoot(t);
      const open = hub(dir, ["ask", "Still open?"]).stdout.trim();
      const answered = hub(dir, ["ask", "Answered?"]).stdout.trim();
      const handled = hub(dir, ["review", "Handled?"]).stdout.trim();
      const noted = hub(dir, ["ask", "Has a progress row?"]).stdout.trim();

      const feed = path.join(dir, "data", "attention.jsonl");
      writeFileSync(
        feed,
        readFileSync(feed, "utf8") +
          [
            { id: answered, at: "2026-07-29T10:00:00.000Z", answer: "yes" },
            { id: handled, at: "2026-07-29T10:00:00.000Z", done: true },
            { id: noted, at: "2026-07-29T10:00:00.000Z", note: "thinking" },
          ]
            .map((r) => JSON.stringify(r))
            .join("\n") +
          "\n",
      );

      const read = feedLib.parseFeed(readFileSync(feed, "utf8"));
      const stillOpen = new Set(read.open.map((i) => i.id));
      for (const id of [open, answered, handled, noted]) {
        const state = JSON.parse(hub(dir, ["get", id, "--json"]).stdout).state;
        assert.equal(
          state === "waiting",
          stillOpen.has(id),
          `${id}: the CLI says ${state} and the app says ${stillOpen.has(id) ? "waiting" : "answered"}`,
        );
      }
    },
  );
});
