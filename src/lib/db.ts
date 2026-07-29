// The hub database. SQLite via better-sqlite3, migrated on boot, living wherever
// hub.config.json says (never a hardcoded path).
//
// THE ACTION LEDGER, the binding design rule of this whole product: ONE table
// under everything. Every mutation the hub performs is a row in action_ledger.
// The jobs strip, the TODAY digest, undo, and attribution are all VIEWS of that
// one table. Do not build a second history. A separate table for "recent
// activity" or "job log" is the single easiest way to make this product stop
// making sense.
//
// SINGLE WRITER: only the web process ever opens this database. Long-running
// child processes talk through files (a spec in, a transcript and a status file
// out) and never touch SQLite. That is what makes WAL safe here and keeps the
// helper scripts dependency free.
//
// This is the ONLY place a connection is opened, and the handle is cached on
// globalThis rather than in a plain module variable. That is not a style
// choice: a server-module reload (which happens on every edit in dev, and dev
// is a mode this product ships) re-evaluates this file, resets a module
// variable to null, and opens a SECOND connection to the same file while the
// first stays open holding a descriptor and a WAL reader. Over a long session
// that is a slow leak on the one file this product promises to look after.
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config";
import { runMigrations } from "./migrate";

export type LedgerState =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "canceled"
  | "needs-answer"
  | "undone";

export interface LedgerRow {
  id: number;
  /** Who the action is recorded against. Comes from config (hub.actor). */
  actor: string;
  verb: string;
  /** The repo or surface the action touched. */
  target: string;
  /** JSON array of "repo@sha" strings. Undo is a git revert of exactly these. */
  commits: string;
  /** 0 or 1. Outward irreversible actions are 0 and get badged in the UI. */
  undoable: number;
  /** JSON array of output paths and URLs: the never-hunt-for-the-file links. */
  artifacts: string;
  state: LedgerState;
  /** Plain-language detail for a human ("reattached after a restart"). */
  note: string | null;
  /** JSON job spec for long-running work: {kind, params, argv, cwd, env}. NULL = a quick verb. */
  job: string | null;
  /** Supervisor pid, which is the process-group leader. Cancel signals that group. */
  pid: number | null;
  /** Transcript file path under the data dir: stdout and stderr of the job. */
  transcript: string | null;
  /** The app route this action changed, when it can be inferred. A deep link. */
  route: string | null;
  created_at: string;
  /** When it actually began. A queued job waits, so created_at is not started_at. */
  started_at: string | null;
  ended_at: string | null;
}

/** The columns the live surfaces actually render. NOT `job` and NOT `pid`: the
 * job spec can carry argv, an environment and a credential reference, and
 * trimming it is a security property. Selecting the list explicitly makes that
 * property structural rather than a mapping step someone can forget. */
const VIEW_COLUMNS =
  "id, verb, target, state, note, artifacts, route, created_at, started_at, ended_at";

/** A ledger row as read for the wire: the view columns, raw from SQLite. */
export type LedgerViewRow = Pick<
  LedgerRow,
  | "id"
  | "verb"
  | "target"
  | "state"
  | "note"
  | "artifacts"
  | "route"
  | "created_at"
  | "started_at"
  | "ended_at"
>;

/** The cached handle. On globalThis so a dev module reload reuses it. */
interface HubGlobal {
  __hubDb?: Database.Database;
  __hubDbClosing?: boolean;
}
const hubGlobal = globalThis as unknown as HubGlobal;

/** The absolute data directory. Shared by the database, transcripts and job files. */
export function dataDir(): string {
  return loadConfig().dataDir;
}

/** Open (and migrate) the hub database. Its path comes from config, never from code. */
export function getDb(): Database.Database {
  const existing = hubGlobal.__hubDb;
  if (existing !== undefined && existing.open) return existing;

  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "hub.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  hubGlobal.__hubDb = db;
  registerCloseOnExit();
  return db;
}

/** Close the connection. Safe to call twice; the next getDb() reopens. */
export function closeDb(): void {
  const db = hubGlobal.__hubDb;
  hubGlobal.__hubDb = undefined;
  if (db !== undefined && db.open) db.close();
}

function registerCloseOnExit(): void {
  if (hubGlobal.__hubDbClosing === true) return;
  hubGlobal.__hubDbClosing = true;
  // WAL wants a clean close so the -wal file is checkpointed back into the
  // database rather than left for the next process to recover.
  for (const signal of ["exit", "SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      closeDb();
    });
  }
}

/** Parse a ledger row's artifacts JSON. Lives at this layer so every consumer
 * shares one parser without an import cycle. A torn value yields an empty list,
 * never a crash. */
export function parseArtifacts(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/** The most recent ledger rows, newest first, view columns only. */
export function recentLedgerRows(limit: number): LedgerViewRow[] {
  return getDb()
    .prepare(`SELECT ${VIEW_COLUMNS} FROM action_ledger ORDER BY id DESC LIMIT ?`)
    .all(limit) as LedgerViewRow[];
}

/** How many rows sit in each of the states the live surfaces count. */
export function ledgerStateCounts(): Record<LedgerState, number> {
  const empty: Record<LedgerState, number> = {
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    canceled: 0,
    "needs-answer": 0,
    undone: 0,
  };
  const rows = getDb()
    .prepare("SELECT state, COUNT(*) AS n FROM action_ledger GROUP BY state")
    .all() as { state: LedgerState; n: number }[];
  for (const row of rows) empty[row.state] = row.n;
  return empty;
}

/** Run several reads as one consistent view. Two independent SELECTs let a write
 * land between them, and the snapshot then says "1 running" over a strip with no
 * running row: a flicker that self-corrects in 1.5s and that nobody can ever
 * reproduce. Free with better-sqlite3, so there is no reason not to. */
export function readConsistently<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}
