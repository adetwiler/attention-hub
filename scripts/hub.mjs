#!/usr/bin/env node
// hub: the command line side of the attention feed.
//
//   hub ask "Ship it as 2886, or pick another port?" --option "2886" --option "let me pick"
//   hub review "The migration touches a shipped table, worth a look" --link notes/migration.md
//   hub get q-20260729-4k2p1
//   hub feed
//
// It exists so that ANY session, script or scheduled job on this machine can put
// something in front of the human and read the answer back, without the hub
// running, without a port, and without a client library. It appends one line to
// a file. That is the whole integration story, and it is documented for people
// who are not using this script at all in docs/attention-feed.md.
//
// THREE PROPERTIES IT HOLDS ON PURPOSE:
//
//   NO SERVER REQUIRED. The hub reads the file when it next ticks. A question
//   filed while the hub is closed is waiting when you open it, which is exactly
//   the case that matters: you were not there.
//
//   APPEND ONLY. Nothing here ever rewrites a line, so an agent writing and the
//   hub reading need no lock between them.
//
//   DEPENDENCY FREE, and no TypeScript. This runs on the oldest Node the project
//   supports (20), where importing a .ts file simply fails, so it reads the JSON
//   config itself exactly as scripts/serve.mjs does. The duplication of "where
//   is the feed" is deliberate and it is CHECKED: test/hub-cli.test.mjs asserts
//   this script and src/lib/config.ts resolve the same absolute path, and that
//   this script and src/lib/feed.ts agree about what is answered.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The hub root is this script's own parent, so a symlink on your PATH still
// knows which install it belongs to. Node resolves the real path of the file it
// is running, which is what makes that true.
const hubRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CONFIG_FILE = "hub.config.json";
const CONFIG_EXAMPLE_FILE = "hub.config.example.json";
const DATA_DIR_DEFAULT = "data";
const ATTENTION_FEED_DEFAULT = "attention.jsonl";
const FEED_VERSION = 1;
/** How long --wait blocks by default, and how often it looks. */
const WAIT_DEFAULT_S = 900;
const POLL_MS = 1000;

// Exit codes are part of the contract: a caller branches on them.
const OK = 0;
const USAGE = 2;
const WAITING = 3;
const UNKNOWN = 4;
const IO = 5;

const USAGE_TEXT = `hub: put something in front of the human, and read the answer back.

  hub ask "<question>" [options]     file a question. Prints the item id.
  hub review "<what to look at>"     file something to look at and mark handled.
  hub get <id> [--json] [--wait]     read the answer back.
  hub feed                           print the feed file this hub reads.
  hub digest [--dry-run]             email yourself what is still waiting.

Options for ask and review:
  --option "<text>"     a one-tap answer. Repeat for several. Questions only.
  --from "<name>"       who is asking, shown on the item. Your session or script.
  --link "<url|path>"   what it is about. A path opens inside the hub.
  --prompt "<path>"     a ready-to-paste prompt file. The hub shows a copy button.
  --wait [seconds]      block until it is answered, then print the answer.
                        Default ${WAIT_DEFAULT_S} seconds. The id goes to stderr.

Exit codes:
  0  done, or answered      3  still waiting (including a --wait timeout)
  2  wrong usage            4  no such item
  5  the feed could not be read or written

digest is OFF until you configure "email" in hub.config.json, and the hub never
runs it for you: schedule it yourself with cron or launchd. It is the only
outbound call in this product. See docs/email-digest.md.

A question with no options and no question mark is filed as a REPORT: it is
shown as something to read, never as something asking you for an answer.
The file format, so anything can write to it: docs/attention-feed.md`;

// ---------------------------------------------------------------- config

/** The config root, or an empty object. A missing config is not an error: every
 * default below produces a working feed path. */
function readConfigRoot() {
  for (const file of [CONFIG_FILE, CONFIG_EXAMPLE_FILE]) {
    const full = path.join(hubRoot, file);
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      die(IO, `${file} is not valid JSON: ${err.message}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      die(IO, `${file}: expected an object at "(root)"`);
    }
    return parsed;
  }
  return {};
}

/** Expand a leading ~ and resolve relative paths against the hub root, exactly
 * as src/lib/config.ts does. */
function resolveConfigPath(raw) {
  let value = raw;
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    value = value === "~" ? home : path.join(home, value.slice(2));
  }
  return path.isAbsolute(value) ? value : path.join(hubRoot, value);
}

/** Where the feed lives. Same rule as src/lib/config.ts parseAttention. */
function feedPath() {
  const root = readConfigRoot();
  const attention = typeof root["attention"] === "object" && root["attention"] !== null ? root["attention"] : {};
  const declared = attention["feed"];
  if (typeof declared === "string" && declared.trim() !== "") return resolveConfigPath(declared);
  const dataDir = typeof root["dataDir"] === "string" && root["dataDir"].trim() !== "" ? root["dataDir"] : DATA_DIR_DEFAULT;
  return path.join(resolveConfigPath(dataDir), ATTENTION_FEED_DEFAULT);
}

// ---------------------------------------------------------------- feed IO

function die(code, message) {
  console.error(`hub: ${message}`);
  process.exit(code);
}

/** Every parseable row, in file order. A torn LAST line is normal while another
 * process is appending, so it is skipped in silence; anything else broken is
 * reported, because a quietly shorter answer is the one failure this tool must
 * not have. */
function readRows(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    die(IO, `cannot read the feed at ${file}: ${err.message}`);
  }
  const lines = text.split("\n");
  const rows = [];
  let broken = 0;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) rows.push(parsed);
      else broken += 1;
    } catch {
      if (i < lines.length - 1) broken += 1;
    }
  });
  if (broken > 0) console.error(`hub: warning, ${broken} line(s) in ${file} are not valid JSON and were skipped`);
  return rows;
}

/** Append one newline terminated line. One write, so two writers interleave
 * rows and never characters. */
function appendRow(file, row) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(row) + "\n", "utf8");
  } catch (err) {
    die(IO, `cannot write the feed at ${file}: ${err.message}`);
  }
}

/** A readable id: kind, date, and a short random tail. Readable because it shows
 * up in a terminal, in the file and on a ledger row, and a person has to match
 * them up by eye. */
function newId(prefix) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tail = Math.floor(Math.random() * 36 ** 5)
    .toString(36)
    .padStart(5, "0");
  return `${prefix}-${day}-${tail}`;
}

/** Does this row close its item? The same rule as src/lib/feed.ts: a string
 * `answer`, or `done: true`. Nothing else, so progress rows are safe to append. */
function closes(row) {
  return typeof row.answer === "string" || row.done === true;
}

/** One item's state: its ask row and its answer, if it has one yet. */
function lookup(file, id) {
  const rows = readRows(file);
  let ask = null;
  let answer = null;
  for (const row of rows) {
    if (row.id !== id) continue;
    if (closes(row)) {
      if (answer === null) answer = row;
      continue;
    }
    if (ask === null && typeof row.ask === "string") ask = row;
  }
  return { ask, answer };
}

// ---------------------------------------------------------------- arguments

/** Flags with values, repeatable where it makes sense. Deliberately small: a
 * hand written parser is fewer moving parts than an argument library, and this
 * script has four verbs. */
function parseArgs(argv) {
  const out = { positional: [], options: [], wait: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out.positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "wait") {
      const next = argv[i + 1];
      if (next !== undefined && /^\d+$/.test(next)) {
        out.wait = Number(next);
        i += 1;
      } else {
        out.wait = WAIT_DEFAULT_S;
      }
      continue;
    }
    if (name === "json" || name === "help" || name === "dry-run") {
      out[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) die(USAGE, `--${name} needs a value`);
    i += 1;
    if (name === "option") out.options.push(value);
    else if (["from", "link", "prompt"].includes(name)) out[name] = value;
    else die(USAGE, `unknown option --${name}\n\n${USAGE_TEXT}`);
  }
  return out;
}

// ---------------------------------------------------------------- verbs

function fileItem(kind, args, file) {
  const text = args.positional[0];
  if (text === undefined || text.trim().length === 0) {
    die(USAGE, `${kind === "review-ask" ? "review" : "ask"} needs the text as its first argument\n\n${USAGE_TEXT}`);
  }
  if (kind === "review-ask" && args.options.length > 0) {
    die(USAGE, "a review ask has one action, mark handled, so --option does not apply to it");
  }
  const id = newId(kind === "review-ask" ? "r" : "q");
  // The kind is written down rather than left to be re-derived by every reader:
  // an explicit "agent-notice" is how a report says it is not asking anything.
  const declared =
    kind === "review-ask"
      ? "review-ask"
      : args.options.length > 0 || text.includes("?")
        ? "agent-question"
        : "agent-notice";
  const row = { v: FEED_VERSION, id, kind: declared, at: new Date().toISOString(), ask: text };
  if (args.from !== undefined) row.from = args.from;
  if (args.options.length > 0) row.options = args.options;
  if (args.link !== undefined) row.link = args.link;
  if (args.prompt !== undefined) row.prompt = args.prompt;
  appendRow(file, row);
  return id;
}

/** Poll until answered or out of time. A poll and not a watcher, for the same
 * reason the hub does not watch this file: a watcher is a per platform
 * reliability problem in exchange for latency nobody can perceive. */
async function waitFor(file, id, seconds) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const { ask, answer } = lookup(file, id);
    if (ask === null) return { ask: null, answer: null };
    if (answer !== null) return { ask, answer };
    if (Date.now() >= deadline) return { ask, answer: null };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function report(id, ask, answer, asJson) {
  if (asJson) {
    console.log(
      JSON.stringify({
        id,
        kind: typeof ask.kind === "string" ? ask.kind : null,
        ask: ask.ask,
        at: typeof ask.at === "string" ? ask.at : null,
        from: typeof ask.from === "string" ? ask.from : null,
        options: Array.isArray(ask.options) ? ask.options : [],
        state: answer === null ? "waiting" : "answered",
        answer: answer === null ? null : answer.answer,
        answeredAt: answer === null ? null : (answer.at ?? null),
      }),
    );
    return answer === null ? WAITING : OK;
  }
  if (answer === null) {
    console.error(`hub: ${id} is still waiting for an answer`);
    return WAITING;
  }
  // The answer, and only the answer, on stdout: this is the line a script reads.
  console.log(answer.answer);
  return OK;
}

// ---------------------------------------------------------------- the digest
//
// THE EMAIL DIGEST LIVES HERE, IN THE CLI, AND THAT IS THE DESIGN (ADR-0008).
//
// The hub itself makes no outbound call, and this does not change that: nothing
// under src/ sends anything, no timer runs inside the web process, and this
// command only ever runs because YOU scheduled it. It reads the feed you already
// have and posts one message to a provider you chose, with a key that is yours
// and that never appears in hub.config.json.
//
// It is in this file rather than a script of its own because it needs exactly
// the two things this file already implements: where the feed is, and what
// counts as still waiting. A third copy of "where is the feed" is the wart this
// project already knows about, and a fourth would be a choice.
//
// QUIET HOURS DO NOT APPLY. Quiet hours are live state in the hub's database,
// and only the web process may open that database (the single-writer rule). The
// schedule here is yours, so the honest answer is that you decide when this runs.

/** The provider. One HTTPS request, so the digest costs no dependency and the
 * shipped tree grows no mail library. */
const EMAIL_ENDPOINT = "https://api.resend.com/emails"; // hub-allow-network: the email digest, off by default, sending to the address YOU configured with YOUR key. ADR-0008.

/** Still open, oldest first: the same rule as src/lib/feed.ts, and asserted
 * against it by test/hub-cli.test.mjs. */
function openItems(rows) {
  const answered = new Set();
  const items = new Map();
  for (const row of rows) {
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    if (closes(row)) {
      answered.add(row.id);
      continue;
    }
    if (typeof row.ask !== "string" || row.ask.length === 0) continue;
    if (!items.has(row.id)) items.set(row.id, row);
  }
  const open = [...items.values()].filter((row) => !answered.has(row.id));
  return open
    .map((row, index) => ({ row, index, ms: Date.parse(typeof row.at === "string" ? row.at : "") || 0 }))
    .sort((a, b) => a.ms - b.ms || a.index - b.index)
    .map(({ row }) => row);
}

/** The email section of the config, unresolved. Read here rather than imported
 * for the same reason feedPath is: this script runs on a Node that cannot load
 * TypeScript, and it has to work with the hub closed. */
function emailConfig() {
  const root = readConfigRoot();
  const raw = typeof root["email"] === "object" && root["email"] !== null ? root["email"] : {};
  for (const forbidden of ["apiKey", "key", "token", "password", "secret"]) {
    if (raw[forbidden] !== undefined) {
      die(
        USAGE,
        `hub.config.json: remove "email.${forbidden}". A secret never goes in that file, because it is the file people paste into bug reports. Put the key in its own file and name it with "email.apiKeyFile".`,
      );
    }
  }
  return {
    enabled: raw.enabled === true,
    to: typeof raw.to === "string" ? raw.to : null,
    from: typeof raw.from === "string" ? raw.from : null,
    apiKeyFile: typeof raw.apiKeyFile === "string" ? resolveConfigPath(raw.apiKeyFile) : null,
    subject: typeof raw.subject === "string" && raw.subject.trim() !== "" ? raw.subject : "Attention Hub",
  };
}

/** Escape for HTML. An item's text is written by whatever filed it, and it lands
 * in a mail client, so it is escaped rather than trusted. */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The digest as an email.
 *
 * TABLES AND INLINE STYLES ONLY, and that is not a style preference: mail
 * clients strip stylesheets and several of the common ones do not lay out flex
 * or grid at all. Severity is carried by a coloured left border on a table row,
 * which survives everywhere, rather than by an icon a client may not draw.
 */
function renderDigest(items, hubName) {
  const count = items.length;
  const subject = `${count} waiting for you`;

  const lines = items.map((row) => {
    const from = typeof row.from === "string" && row.from.length > 0 ? row.from : "unknown";
    const kind = row.kind === "review-ask" ? "review" : row.kind === "agent-notice" ? "report" : "question";
    const at = typeof row.at === "string" && row.at.length > 0 ? row.at : "";
    return { id: row.id, ask: String(row.ask), from, kind, at };
  });

  const text = [
    `${hubName}: ${count} ${count === 1 ? "thing is" : "things are"} waiting for you.`,
    "",
    ...lines.map((line) => `- [${line.kind}] ${line.ask}\n  from ${line.from}, ${line.at}, id ${line.id}`),
    "",
    "Answer them in the hub. Nothing here can be answered by replying to this mail.",
  ].join("\n");

  const rows = lines
    .map(
      (line) => `
          <tr>
            <td style="padding:0 0 12px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="border-left:3px solid ${line.kind === "question" ? "#e05c4b" : "#f5a94b"};padding:8px 0 8px 12px;">
                    <div style="font:600 15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f2e9d7;">${esc(line.ask)}</div>
                    <div style="font:12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#8a7a5f;">${esc(line.kind)} from ${esc(line.from)} ${esc(line.at)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#100a06;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#100a06;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:600px;max-width:100%;">
          <tr>
            <td style="padding:0 0 16px 0;font:600 18px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f5a94b;">
              ${esc(hubName)}: ${count} ${count === 1 ? "thing is" : "things are"} waiting for you
            </td>
          </tr>${rows}
          <tr>
            <td style="padding:8px 0 0 0;border-top:1px solid #2a1f14;font:12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#8a7a5f;">
              Answer these in the hub, on the machine it runs on. Replying to this message reaches nobody.
              You are getting it because you configured the email digest yourself; remove the "email" section
              from hub.config.json and it stops.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

async function sendDigest(config, message) {
  let key;
  try {
    key = readFileSync(config.apiKeyFile, "utf8").trim();
  } catch (err) {
    die(IO, `cannot read the API key file at ${config.apiKeyFile}: ${err.message}`);
  }
  if (key.length === 0) die(USAGE, `the API key file at ${config.apiKeyFile} is empty`);

  let response;
  try {
    // The marker below is ON the call's own line, not above it: the gate reads
    // one line at a time, so a marker on a comment line protects nothing while
    // looking armed. That is a real defect this repo has already had once.
    response = await fetch(EMAIL_ENDPOINT, { // hub-allow-network: THE one outbound call in this product, off by default, to the provider the USER chose, with the USER's own key. ADR-0008.
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        subject: `${config.subject}: ${message.subject}`,
        html: message.html,
        text: message.text,
      }),
    });
  } catch (err) {
    die(IO, `the email provider could not be reached: ${err.message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    die(IO, `the email provider refused the message (HTTP ${response.status}): ${body.slice(0, 400)}`);
  }
}

async function digest(file, dryRun) {
  const config = emailConfig();
  if (!config.enabled) {
    die(
      USAGE,
      'the email digest is off. Set "email": { "enabled": true, ... } in hub.config.json first, and read docs/email-digest.md. Nothing was sent.',
    );
  }
  const missing = ["to", "from", "apiKeyFile"].filter((key) => config[key] === null);
  if (missing.length > 0) {
    die(USAGE, `hub.config.json: the email digest needs ${missing.map((k) => `"email.${k}"`).join(", ")}. Nothing was sent.`);
  }

  const items = openItems(readRows(file));
  if (items.length === 0) {
    // An empty digest is a mail that trains you to ignore the next one.
    console.error("hub: nothing is waiting, so no digest was sent.");
    return OK;
  }

  const message = renderDigest(items, "Attention Hub");
  if (dryRun) {
    // Everything the send would use, and NOT the key: a dry run is the thing you
    // paste into an issue when it does not work.
    console.log(`To: ${config.to}`);
    console.log(`From: ${config.from}`);
    console.log(`Subject: ${config.subject}: ${message.subject}`);
    console.log(`Key file: ${config.apiKeyFile}`);
    console.log("");
    console.log(message.text);
    console.log("");
    console.log(message.html);
    console.error(`hub: dry run, nothing was sent. ${items.length} item(s) would have gone to ${config.to}.`);
    return OK;
  }

  await sendDigest(config, message);
  console.error(`hub: sent ${items.length} item(s) to ${config.to}.`);
  return OK;
}

// ---------------------------------------------------------------- main

const [verb, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (verb === undefined || verb === "help" || verb === "--help" || verb === "-h" || args.help === true) {
  console.log(USAGE_TEXT);
  process.exit(verb === undefined ? USAGE : OK);
}

const file = feedPath();

if (verb === "feed") {
  console.log(file);
  process.exit(OK);
}

if (verb === "digest") {
  process.exit(await digest(file, args["dry-run"] === true));
}

if (verb === "ask" || verb === "review") {
  const id = fileItem(verb === "review" ? "review-ask" : "agent-question", args, file);
  if (args.wait === null) {
    console.error(`hub: filed ${id}. It is waiting in the hub now.`);
    console.log(id);
    process.exit(OK);
  }
  console.error(`hub: filed ${id}, waiting up to ${args.wait}s for an answer...`);
  const { ask, answer } = await waitFor(file, id, args.wait);
  if (ask === null) die(IO, `${id} vanished from the feed straight after being written`);
  process.exit(report(id, ask, answer, args.json === true));
}

if (verb === "get") {
  const id = args.positional[0];
  if (id === undefined) die(USAGE, `get needs an item id\n\n${USAGE_TEXT}`);
  const found = args.wait === null ? lookup(file, id) : await waitFor(file, id, args.wait);
  if (found.ask === null) {
    console.error(`hub: no item with id ${id} in ${file}`);
    process.exit(UNKNOWN);
  }
  process.exit(report(id, found.ask, found.answer, args.json === true));
}

// An unknown verb prints the whole usage rather than a one line complaint: this
// is the moment someone is guessing at the interface, so show it to them.
die(USAGE, `unknown command "${verb}"\n\n${USAGE_TEXT}`);
