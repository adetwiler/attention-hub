// THE ATTENTION FEED CONTRACT, and nothing else.
//
// This file is the public integration surface of the whole product written as
// code: an append-only JSONL file that any process on this machine can write,
// and that the hub reads. It is documented for strangers in
// docs/attention-feed.md, and the decision behind the shape is ADR-0004.
//
// IT IMPORTS NOTHING, on purpose, for the same reason src/lib/migrate.ts does:
// the contract is the part that has to keep working against files written by
// tools nobody here controls, so it earns a unit test that can load it without
// booting the app (test/feed.test.mjs). Every read of a real file, every
// database write and every ledger row lives in src/lib/attention.ts instead.
//
// THE THREE RULES THAT MAKE IT SAFE FOR TWO PROCESSES AT ONCE:
//
//   APPEND ONLY. No row is ever rewritten, moved or deleted. An answer is a NEW
//   row carrying the same id. That is what lets an agent hold the file open and
//   append to it while the hub reads it, with no lock, no watcher and no
//   coordination beyond the filesystem's own append semantics.
//
//   THE FIRST ROW WINS. The first ask row for an id opens the item and defines
//   it; a later ask row with the same id is ignored rather than treated as an
//   edit. The first closing row for an id is the answer of record.
//
//   A TORN LAST LINE IS NORMAL. The file is being appended to as it is read, so
//   the final line can be half written. That one is skipped in silence. A
//   malformed line ANYWHERE ELSE is real corruption, is counted, and the hub
//   says so rather than rendering a shorter list as though it were the truth.

/** What an item is. Three kinds, and the difference is what it wants from you.
 *
 *  agent-question  something is blocked and needs an answer to continue.
 *  agent-notice    a report filed through the same channel. It wants triage,
 *                  not an answer, and it must never be labelled as asking you.
 *                  A question with no options and no question mark IS one of
 *                  these: it was a report all along and saying "asks you" over
 *                  it is a small lie that the surface repeats all day.
 *  review-ask      something for you to look at and mark handled. Nothing runs
 *                  when you do; it only stops the readers showing it.
 */
export type AttentionKind = "agent-question" | "agent-notice" | "review-ask";

const KINDS: readonly string[] = ["agent-question", "agent-notice", "review-ask"];

/** The schema version a writer stamps on a row. Absent means 1. */
export const FEED_VERSION = 1;

/** An item that genuinely needs the human, as every live surface renders it. */
export interface AttentionItem {
  /** The id the answer row references. Unique per item, chosen by the writer. */
  id: string;
  kind: AttentionKind;
  /** Who filed it. null when the row did not say, and the UI then shows nothing
   * rather than inventing a plausible name for it. */
  source: string | null;
  /** What is being asked, in plain language. */
  ask: string;
  /** ISO timestamp from the ask row. "" when the row carried none. */
  at: string;
  /** One-tap answers. Empty means the reply is free text. */
  options: string[];
  /** A URL, or a path to a file on this machine. See AttentionLink: an http
   * link opens a tab, anything else opens inside the hub. */
  link: string | null;
  /** A path to a ready-to-paste prompt file. The surface renders a copy button
   * that reads it, which is the whole point: "when this fires, hand me the
   * exact prompt to run". */
  prompt: string | null;
}

/** The answer of record for an item, once one exists. */
export interface AttentionAnswer {
  /** The text answered, or "" for a review ask that was simply marked handled. */
  answer: string;
  at: string;
  /** Who answered, when the row said. */
  by: string | null;
}

/** One parsed feed, with the honesty channel attached. */
export interface FeedRead {
  /** Still open, OLDEST FIRST: the thing that has waited longest is the thing
   * to answer. Ties keep file order, so the sort is stable and reproducible. */
  open: AttentionItem[];
  /** Every item the file has ever opened, by id, answered or not. `hub get`
   * reads this so a session can still read the answer back after it landed. */
  all: Map<string, AttentionItem>;
  /** Answers by item id. */
  answers: Map<string, AttentionAnswer>;
  /** Malformed lines that were NOT the last line, which is the case that means
   * corruption rather than an append in flight. */
  malformed: number;
}

// ---------------------------------------------------------------- narrowing

function str(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionList(raw: Record<string, unknown>): string[] {
  const value = raw["options"];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/** The declared kind, or the derived one. A row that declares nothing is a
 * question when it carries options or a question mark, and a notice otherwise. */
function kindOf(raw: Record<string, unknown>, ask: string, options: string[]): AttentionKind {
  const declared = raw["kind"];
  if (typeof declared === "string" && KINDS.includes(declared)) return declared as AttentionKind;
  return options.length > 0 || ask.includes("?") ? "agent-question" : "agent-notice";
}

/** Does this row CLOSE its item? A string `answer` (including "", which is how
 * a one-tap "handled" reads) or `done: true`. Nothing else counts, so a writer
 * can append progress rows against the same id without accidentally closing it. */
function closesItem(raw: Record<string, unknown>): boolean {
  return typeof raw["answer"] === "string" || raw["done"] === true;
}

// ---------------------------------------------------------------- parse

/**
 * Parse a whole feed file.
 *
 * @param text the file's contents. An empty or absent file is an empty feed,
 *   which is an honest "nothing is waiting", not an error.
 */
export function parseFeed(text: string): FeedRead {
  const lines = text.split("\n");
  const all = new Map<string, AttentionItem>();
  const order: string[] = [];
  const answers = new Map<string, AttentionAnswer>();
  let malformed = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // The last line can be half written while a writer is mid-append. Any
      // other broken line is real damage and the reader says so.
      if (i < lines.length - 1) malformed += 1;
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      malformed += 1;
      continue;
    }
    const raw = parsed as Record<string, unknown>;
    const id = str(raw, "id");
    if (id === null) continue; // a row with no id belongs to no item: ignored, not corrupt

    if (closesItem(raw)) {
      // The FIRST close wins. A second one is a duplicate ack, not an edit.
      if (!answers.has(id)) {
        const answer = raw["answer"];
        answers.set(id, {
          answer: typeof answer === "string" ? answer : "",
          at: str(raw, "at") ?? "",
          by: str(raw, "by"),
        });
      }
      continue;
    }

    const ask = str(raw, "ask");
    if (ask === null) continue; // neither an ask nor a close: some other row, not ours
    if (all.has(id)) continue; // the first ask row for an id defines it, always

    const options = optionList(raw);
    all.set(id, {
      id,
      kind: kindOf(raw, ask, options),
      source: str(raw, "from"),
      ask,
      at: str(raw, "at") ?? "",
      options,
      link: str(raw, "link"),
      prompt: str(raw, "prompt"),
    });
    order.push(id);
  }

  const open = order
    .flatMap((id) => {
      const item = all.get(id);
      return item === undefined || answers.has(id) ? [] : [item];
    })
    .map((item, index) => ({ item, index }))
    .sort((a, b) => stamp(a.item.at) - stamp(b.item.at) || a.index - b.index)
    .map(({ item }) => item);

  return { open, all, answers, malformed };
}

/** A row's stamp as milliseconds. An unparseable or absent one sorts oldest, so
 * a writer that forgot the timestamp is surfaced first rather than buried. */
function stamp(at: string): number {
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? 0 : ms;
}

// ---------------------------------------------------------------- write

/** The fields a writer supplies to open an item. */
export interface AskInput {
  id: string;
  kind: AttentionKind;
  ask: string;
  from?: string | null;
  options?: string[];
  link?: string | null;
  prompt?: string | null;
  at?: string;
}

/** Serialize one ask row. ONE line, newline terminated, no pretty printing:
 * a single write() of a single line is what makes concurrent appends safe. */
export function askRow(input: AskInput): string {
  const row: Record<string, unknown> = {
    v: FEED_VERSION,
    id: input.id,
    kind: input.kind,
    at: input.at ?? new Date().toISOString(),
    ask: input.ask,
  };
  if (input.from !== undefined && input.from !== null && input.from.length > 0) row["from"] = input.from;
  if (input.options !== undefined && input.options.length > 0) row["options"] = input.options;
  if (input.link !== undefined && input.link !== null && input.link.length > 0) row["link"] = input.link;
  if (input.prompt !== undefined && input.prompt !== null && input.prompt.length > 0) row["prompt"] = input.prompt;
  return JSON.stringify(row) + "\n";
}

/** Serialize one answer row. This is the ONLY way an item is ever closed. */
export function answerRow(id: string, answer: string, by: string | null, at = new Date().toISOString()): string {
  const row: Record<string, unknown> = { v: FEED_VERSION, id, at, answer };
  if (by !== null && by.length > 0) row["by"] = by;
  return JSON.stringify(row) + "\n";
}

/** A readable, collision-resistant id: kind prefix, date, and random suffix.
 * Readable matters because it appears in a terminal, in the file, and in a
 * ledger row, and a human has to match them up by eye.
 *
 * @param prefix short kind marker, "q" for a question, "r" for a review ask
 * @param random injected so a test can be deterministic
 */
export function newId(prefix: string, now = new Date(), random = Math.random): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(random() * 36 ** 5)
    .toString(36)
    .padStart(5, "0");
  return `${prefix}-${day}-${suffix}`;
}
