#!/usr/bin/env node
// DEMO SEED - fill an empty hub with a believable day, so you can see what it does
// before you wire it to anything of your own.
//
//   node scripts/demo-seed.mjs              # config + attention feed
//   node scripts/demo-seed.mjs --terminals  # ALSO switch the terminal module on (read below)
//   node scripts/demo-seed.mjs --undo       # remove everything it wrote
//
// WHY THIS EXISTS. A hub with nothing in it is honest and completely uninformative: every
// panel correctly says "nothing yet", which tells a first-time reader nothing about what the
// thing is for. This writes a day's worth of the real thing through the real code path: rows
// in data/attention.jsonl exactly as docs/attention-feed.md specifies them, read by the same
// reader your own scripts will be read by. Nothing here is a mock screen or a fixture the app
// knows about. Delete the rows and the hub is empty again.
//
// IT REFUSES TO TOUCH A HUB YOU HAVE ALREADY SET UP. If hub.config.json exists, or the feed
// already has rows, it stops and says so. Use --force only on a hub you do not mind rewriting.
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CONFIG = join(ROOT, "hub.config.json");
const EXAMPLE = join(ROOT, "hub.config.example.json");
const DATA = join(ROOT, "data");
const FEED = join(DATA, "attention.jsonl");
const DEMO_DIR = join(DATA, "demo-projects");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const FORCE = has("--force");

/** The marker that makes --undo safe: it only removes rows IT wrote. */
const TAG = "demo-seed";

// ── the day ────────────────────────────────────────────────────────────────────
//
// Written to read like a real morning rather than a feature list. Two things are
// deliberate: the oldest item is the dullest (that is what "oldest first" is FOR, and a demo
// that puts the exciting one on top teaches the wrong lesson), and one item is already
// answered, because a queue that has never been used does not show you what using it looks
// like.
//
// Nothing here names a real project, person or company. It is a generic developer's day.
const HOURS = (h) => new Date(Date.now() - h * 3600_000).toISOString();

const DAY = [
  {
    id: "demo-docs-links",
    kind: "agent-question",
    at: HOURS(14),
    from: "docs sweep",
    ask: "Found 14 dead links in the docs. Fix the 9 internal ones automatically?",
    options: ["fix the internal ones", "show me the list first"],
  },
  {
    id: "demo-nightly-red",
    kind: "agent-notice",
    at: HOURS(9),
    from: "nightly build",
    ask: "Three checks went red overnight, all in the same file. Nothing is blocked on you.",
  },
  {
    id: "demo-migration",
    kind: "agent-question",
    at: HOURS(6),
    from: "schema check",
    ask: "This migration edits a table that has already shipped. Add a new one instead?",
    options: ["add a new one", "edit it anyway"],
  },
  {
    id: "demo-release-notes",
    kind: "review-ask",
    at: HOURS(3),
    from: "release drafter",
    ask: "Draft release notes for 0.4.2 are ready for a read before they go out.",
  },
  {
    id: "demo-deps",
    kind: "agent-question",
    at: HOURS(1),
    from: "dependency watch",
    ask: "Two updates need a major version bump. Take them now or hold until after the release?",
    options: ["take them", "hold until after"],
  },
];

/** One already answered, so the demo shows a used queue rather than a new one. */
const ANSWERED = [
  {
    id: "demo-answered-cache",
    kind: "agent-question",
    at: HOURS(20),
    from: "perf pass",
    ask: "The cache can be warmed on boot instead of on first request. Worth the extra 400ms of startup?",
    options: ["warm it on boot", "leave it lazy"],
  },
];

const PROFILES = {
  work: { label: "WORK" },
  side: { label: "SIDE PROJECT" },
  docs: { label: "DOCS" },
  ops: { label: "OPS" },
};

// ── undo ───────────────────────────────────────────────────────────────────────
if (has("--undo")) {
  let removed = 0;
  if (existsSync(FEED)) {
    const keep = readFileSync(FEED, "utf8")
      .split("\n")
      .filter((line) => {
        if (line.trim() === "") return false;
        try {
          // Only rows this script tagged. A row you or your own tooling wrote is never touched.
          if (JSON.parse(line).seed === TAG) { removed++; return false; }
        } catch { /* a line we cannot parse is not ours to delete */ }
        return true;
      });
    writeFileSync(FEED, keep.length > 0 ? keep.join("\n") + "\n" : "");
  }
  rmSync(DEMO_DIR, { recursive: true, force: true });
  console.log(`removed ${removed} demo row(s) from the feed, and the demo project folder.`);
  console.log("hub.config.json was NOT touched: it is yours now. Delete it by hand to start over.");
  process.exit(0);
}

// ── refuse to clobber a real setup ─────────────────────────────────────────────
const feedRows = existsSync(FEED)
  ? readFileSync(FEED, "utf8").split("\n").filter((l) => l.trim() !== "").length
  : 0;
if (!FORCE && (existsSync(CONFIG) || feedRows > 0)) {
  console.error("demo-seed: this hub is already set up, so nothing was written.\n");
  if (existsSync(CONFIG)) console.error(`  ${CONFIG} exists`);
  if (feedRows > 0) console.error(`  the attention feed already has ${feedRows} row(s)`);
  console.error("\nThe demo is for an EMPTY hub. If you really want to overwrite this one:");
  console.error("  node scripts/demo-seed.mjs --force");
  process.exit(1);
}

// ── config ─────────────────────────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(EXAMPLE, "utf8"));
cfg.profiles = { ...(cfg.profiles ?? {}) };
for (const k of Object.keys(cfg.profiles)) if (!k.startsWith("$")) delete cfg.profiles[k];
Object.assign(cfg.profiles, PROFILES);

if (has("--terminals")) {
  // ⚠️ NOT THE DEFAULT, ON PURPOSE. A terminal pane is a real shell on this machine reached
  // from a browser tab. The module ships off and docs/terminal.md explains what turning it on
  // means. A demo script that quietly switched on a shell-over-HTTP would be teaching exactly
  // the wrong habit, so this is a flag you type, and it says what it did.
  mkdirSync(DEMO_DIR, { recursive: true });
  cfg.terminal = { ...(cfg.terminal ?? {}), enabled: true };
  cfg.wall = {
    ...(cfg.wall ?? {}),
    paneKind: "terminal",
    panes: Object.entries(PROFILES).map(([id, p]) => ({
      id, kind: "terminal", profile: id, label: p.label, cwd: DEMO_DIR,
    })),
  };
  console.log("⚠️  terminal module: ON. Every pane is a real shell on this machine.");
  console.log("   Read docs/terminal.md. Turn it off with \"terminal\": { \"enabled\": false }.");
} else {
  cfg.wall = { ...(cfg.wall ?? {}), paneKind: "placeholder", panes: [] };
}

writeFileSync(CONFIG, JSON.stringify(cfg, null, 1) + "\n");

// ── the feed ───────────────────────────────────────────────────────────────────
mkdirSync(DATA, { recursive: true });
const append = (row) => appendFileSync(FEED, JSON.stringify({ v: 1, seed: TAG, ...row }) + "\n");
for (const row of ANSWERED) {
  append(row);
  append({ id: row.id, at: HOURS(19), answer: row.options[0], by: "you" });
}
for (const row of DAY) append(row);

console.log(`\nSeeded ${DAY.length} open item(s) and 1 answered one into data/attention.jsonl`);
console.log(`Wrote hub.config.json with ${Object.keys(PROFILES).length} profiles, so the wall is a 2x2.`);
console.log("\nStart it:  npm run dev     then open the hub and look at TODAY and WALL.");
console.log("Undo it:   node scripts/demo-seed.mjs --undo\n");
