// The attention feed, where it meets the machine: reading the file, writing the
// answer, and the ledger rows that make both visible afterwards.
//
// The CONTRACT is src/lib/feed.ts, which imports nothing and is tested on its
// own. This file is everything that touches the world, and it holds four
// promises the contract cannot hold by itself:
//
//   NO WATCHER, NO INGEST ENDPOINT. The stream tick re-reads the file about
//   every 1.5 seconds. That is the whole mechanism. A filesystem watcher is a
//   per-platform reliability problem (network shares, editors that write via
//   rename, Windows) in exchange for latency nobody can perceive, and an HTTP
//   ingest endpoint would mean the hub has to be RUNNING for a session to file
//   a question, which is exactly backwards: the question is most valuable when
//   you are not looking. A file works either way. ADR-0004.
//
//   READS ARE CHEAP. Re-reading on every tick is fine because the file is
//   small and local, but it is free to be sure: the parse is cached against the
//   file's size and modification time, so an unchanged file costs one stat.
//
//   BROKEN IS NOT EMPTY. A feed that cannot be read comes back with a reason
//   attached, and the surface renders the reason. A file that exists and cannot
//   be parsed is NOT an empty queue, and the difference matters most at exactly
//   the moment it is hardest to notice: when you are trusting the hub to tell
//   you nothing needs you.
//
//   EVERY MUTATION IS A LEDGER ROW. Answering, marking handled, and both quiet
//   hours verbs all run through runThroughLedger, so "what did I answer, and
//   when" is a question the one history can answer.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config";
import { answerRow, parseFeed } from "./feed";
import type { AttentionItem, FeedRead } from "./feed";
import { runThroughLedger } from "./ledger";
import { computeQuiet, isValidTime } from "./quiet";
import type { QuietState } from "./quiet";
import { settingGet, settingSet } from "./settings";

/** Answers longer than this are a paste accident, not an answer. The cap is
 * stated in the refusal so nobody has to guess what happened. */
const ANSWER_MAX_CHARS = 2000;
/** A document opened in place is a note or a prompt, not a log file. */
const DOC_MAX_BYTES = 512 * 1024;

// ---------------------------------------------------------------- reading

/** The feed as the surfaces see it, with the honesty channel attached. */
export interface FeedView {
  items: AttentionItem[];
  /** null when the file was read cleanly (including when it does not exist yet,
   * which is an honest empty feed). Otherwise a plain-language reason. */
  error: string | null;
}

interface FeedCache {
  key: string;
  read: FeedRead;
}

/** Cached against size and mtime. On globalThis for the same reason the
 * database handle is: a dev module reload must not silently start a second
 * cache while the first one keeps its own idea of the file. */
interface AttentionGlobal {
  __hubFeedCache?: FeedCache;
}
const attentionGlobal = globalThis as unknown as AttentionGlobal;

/** Where the feed lives. From config, never from code. */
export function feedPath(): string {
  return loadConfig().attention.feed;
}

/** Parse the feed, honestly. Never throws: a caller inside the snapshot needs a
 * reason it can render, not an exception that blanks the page. */
export function readFeed(): { read: FeedRead; error: string | null } {
  const file = feedPath();
  let stamp: string;
  try {
    const stat = statSync(file);
    stamp = `${stat.size}:${stat.mtimeMs}`;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Nothing has ever filed anything. That is a real empty state, not a
      // failure, and the card says "nothing needs you" truthfully.
      return { read: parseFeed(""), error: null };
    }
    return {
      read: parseFeed(""),
      error: `The attention feed at ${file} cannot be read (${code ?? "unknown error"}), so this list is not the truth.`,
    };
  }

  const cached = attentionGlobal.__hubFeedCache;
  if (cached !== undefined && cached.key === stamp) return { read: cached.read, error: describe(cached.read, file) };

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { read: parseFeed(""), error: `The attention feed at ${file} could not be opened: ${detail}` };
  }
  const read = parseFeed(text);
  attentionGlobal.__hubFeedCache = { key: stamp, read };
  return { read, error: describe(read, file) };
}

/** Corruption INSIDE the file, as opposed to a half written last line, which is
 * normal while something is appending and is not reported. */
function describe(read: FeedRead, file: string): string | null {
  if (read.malformed === 0) return null;
  return (
    `${read.malformed} line(s) in the attention feed are not valid JSON, so items may be missing from this list. ` +
    `The file is ${file}, and every line in it should be one JSON object.`
  );
}

/** Everything still waiting, oldest first. This is DATA: quiet hours never
 * filter it, and there is no second, quieter version of this list anywhere. */
export function attentionQueue(): FeedView {
  const { read, error } = readFeed();
  return { items: read.open, error };
}

/** The live quiet state, read from the settings table. */
export function quietState(now = new Date()): QuietState {
  return computeQuiet(
    {
      manual: settingGet("quiet.manual"),
      start: settingGet("quiet.start"),
      end: settingGet("quiet.end"),
    },
    now,
  );
}

// ---------------------------------------------------------------- writing

/** What every attention mutation answers with. `ledgerId` is null when the verb
 * refused before anything ran, which means there is no ledger row either. */
export interface AttentionResult {
  ok: boolean;
  message: string;
  ledgerId: number | null;
}

function refuse(message: string): AttentionResult {
  return { ok: false, message, ledgerId: null };
}

/** Append one row. The ONLY writer in the product, so the append-only rule has
 * exactly one place it could ever be broken. */
function append(line: string): void {
  const file = feedPath();
  mkdirSync(path.dirname(file), { recursive: true });
  // One write of one newline-terminated line. Two processes appending to the
  // same file this way interleave rows, never characters.
  appendFileSync(file, line, "utf8");
}

/** Answer an open item: APPEND the answer row. Nothing is rewritten, which is
 * what lets the asking session read its own answer back out of the same file it
 * wrote the question to.
 *
 * Guarded on OPEN, not on existing: answering something that was already
 * answered elsewhere (a stale toast in a second tab) is refused with the reason,
 * and the first answer stands. */
export async function answerItem(id: string, answer: string): Promise<AttentionResult> {
  const trimmed = answer.trim();
  if (id.length === 0) return refuse("expected an item id, and there was none");
  if (trimmed.length === 0) return refuse("an empty answer is not an answer, so nothing was recorded");
  if (trimmed.length > ANSWER_MAX_CHARS) {
    return refuse(`that answer is ${trimmed.length} characters and the limit is ${ANSWER_MAX_CHARS}`);
  }
  const { read, error } = readFeed();
  if (error !== null) return refuse(error);
  const item = read.open.find((i) => i.id === id);
  if (item === undefined) {
    return refuse(`"${id}" is not waiting for an answer. It was answered somewhere else, or it never existed.`);
  }
  const actor = loadConfig().hub.actor;
  const run = await runThroughLedger("answer", id, false, async () => {
    append(answerRow(id, trimmed, actor));
    return {
      ok: true,
      message: `Answered. Whatever asked reads its answer back out of the same file, so it can carry on.`,
      artifacts: [feedPath()],
    };
  });
  return { ok: run.ok, message: run.message, ledgerId: run.ledgerId };
}

/** Mark a review ask handled. It appends the same kind of closing row, with an
 * empty answer.
 *
 * The label in the UI is "mark handled" and not "resolve" on purpose: this only
 * stops the readers showing you the item. Nothing runs, nothing is fixed, and
 * nobody is told. "Resolve" reads like the hub did the thing for you. */
export async function resolveItem(id: string): Promise<AttentionResult> {
  if (id.length === 0) return refuse("expected an item id, and there was none");
  const { read, error } = readFeed();
  if (error !== null) return refuse(error);
  const item = read.open.find((i) => i.id === id);
  if (item === undefined) {
    return refuse(`"${id}" is not waiting. It was handled somewhere else, or it never existed.`);
  }
  const actor = loadConfig().hub.actor;
  const run = await runThroughLedger("mark-handled", id, false, async () => {
    append(answerRow(id, "", actor));
    return {
      ok: true,
      message: "Marked handled. It leaves the list, and nothing else happened.",
      artifacts: [feedPath()],
    };
  });
  return { ok: run.ok, message: run.message, ledgerId: run.ledgerId };
}

/** Flip the sticky manual quiet toggle. */
export async function setQuietManual(on: boolean): Promise<AttentionResult & { quiet: QuietState }> {
  const run = await runThroughLedger("quiet-mode", "attention", false, async () => {
    settingSet("quiet.manual", on ? "1" : "0");
    const state = quietState();
    return {
      ok: true,
      message: on
        ? "Quiet on. Nothing pops up, the list keeps filling, and it stays off until you turn it back on."
        : state.scheduled
          ? `Quiet off, but it is still quiet on the schedule until ${state.end}.`
          : `Quiet off. Scheduled quiet is ${state.start} to ${state.end}.`,
      artifacts: [],
    };
  });
  return { ok: run.ok, message: run.message, ledgerId: run.ledgerId, quiet: quietState() };
}

/** Change the schedule. Both times are validated before anything is written. */
export async function setQuietHours(start: string, end: string): Promise<AttentionResult & { quiet: QuietState }> {
  if (!isValidTime(start) || !isValidTime(end)) {
    return { ...refuse('quiet hours are 24 hour times like 22:00 and 06:00'), quiet: quietState() };
  }
  const run = await runThroughLedger("set-quiet-hours", "attention", false, async () => {
    settingSet("quiet.start", start);
    settingSet("quiet.end", end);
    return {
      ok: true,
      message:
        start === end
          ? `Saved ${start} to ${end}, which is a window with no length, so scheduled quiet will never start. The manual toggle still works.`
          : `Saved. Quiet from ${start} to ${end}, every day.`,
      artifacts: [],
    };
  });
  return { ok: run.ok, message: run.message, ledgerId: run.ledgerId, quiet: quietState() };
}

// ---------------------------------------------------------------- attachments

/** Which of an item's two file references is being opened. */
export type Attachment = "link" | "prompt";

export interface AttachmentResult {
  ok: boolean;
  message: string;
  /** The file's own name, for the window title. */
  name: string;
  /** Rendered HTML for a markdown document, otherwise null. */
  html: string | null;
  /** The raw text. The copy button copies THIS, never the rendered version. */
  text: string;
}

/**
 * Read a file an attention item points at.
 *
 * THE GUARD IS THE FEED ITSELF: the only readable paths are the `link` and
 * `prompt` values of items currently open in the feed. The browser never names
 * a path, it names an item, so this endpoint cannot be walked into reading
 * anything the feed did not already point at. That is a stronger property than
 * a prefix check, and it needs no configuration.
 */
export function readAttachment(id: string, which: Attachment): AttachmentResult {
  const empty = { name: "", html: null, text: "" };
  const { read, error } = readFeed();
  if (error !== null) return { ok: false, message: error, ...empty };
  const item = read.open.find((i) => i.id === id);
  if (item === undefined) return { ok: false, message: `"${id}" is not waiting, so it has nothing to open.`, ...empty };
  const target = which === "prompt" ? item.prompt : item.link;
  if (target === null) return { ok: false, message: `That item has no ${which}.`, ...empty };
  if (/^https?:\/\//.test(target)) {
    // hub-no-request: this only CLASSIFIES a string as a web address. Nothing is fetched; the browser opens it in a tab.
    return { ok: false, message: "That is a web address, so it opens in a tab rather than here.", ...empty };
  }

  const file = expandHome(target);
  let stat;
  try {
    stat = statSync(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { ok: false, message: `${target} is not on disk (${code ?? "unknown error"}).`, ...empty };
  }
  if (!stat.isFile()) return { ok: false, message: `${target} is not a file.`, ...empty };
  if (stat.size > DOC_MAX_BYTES) {
    return {
      ok: false,
      message: `${target} is ${Math.round(stat.size / 1024)}KB, and the hub shows files up to ${DOC_MAX_BYTES / 1024}KB in place.`,
      ...empty,
    };
  }

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `${target} could not be read: ${detail}`, ...empty };
  }
  const name = path.basename(file);
  const isMarkdown = /\.(md|markdown)$/i.test(name);
  return {
    ok: true,
    message: "",
    name,
    // Rendering happens here rather than in the browser so the parser stays on
    // one side of the wire and the client component holds no markdown logic.
    html: isMarkdown ? renderMarkdownLazy(text) : null,
    text,
  };
}

/** `marked` is only pulled in when a markdown document is actually opened, so
 * the parser is not part of the module graph of every page that renders the
 * feed. `require` rather than a top level import for exactly that reason. */
function renderMarkdownLazy(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- no eslint here; kept as a note for whoever adds it
  const mod = require("./markdown") as { renderMarkdown: (source: string) => string };
  return mod.renderMarkdown(text);
}

/** Expand a leading ~ the same way the config loader does. A path written into
 * a feed row by some other tool is exactly as likely to use it. */
function expandHome(raw: string): string {
  if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return raw === "~" ? home : path.join(home, raw.slice(2));
  }
  return raw;
}
