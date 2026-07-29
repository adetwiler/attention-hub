// The ledger snapshot: ONE shape feeds every live surface (the jobs strip, the
// attention card, the counts in the topbar), because they are all views of the
// one action ledger. The SSE route diffs this snapshot server-side and emits
// only on change; the same function answers ?once=1 as plain JSON, so the poll
// fallback can never drift from the stream.
//
// TRIMMING IS A SECURITY PROPERTY, not tidiness. The job spec (argv, env, any
// credential reference) and the pid NEVER travel to a browser. The query in
// db.ts names the view columns explicitly so they are not even read out of
// SQLite, rather than being read and then dropped by a mapping step someone
// could later forget.
//
// BROKEN IS NOT EMPTY. safeLedgerSnapshot never throws, but it also never lies:
// a database it cannot read comes back with `degraded` set, the UI renders it,
// and the reason is logged. Silently returning an empty snapshot made a broken
// install byte-identical to a healthy fresh one (0 running, 0 queued, "No jobs
// yet", forever), which is the exact failure the honest-empty-state rule exists
// to prevent.
import { ledgerStateCounts, parseArtifacts, readConsistently, recentLedgerRows } from "./db";
import type { LedgerState, LedgerViewRow } from "./db";

/** A ledger row as the live surfaces render it. A trimmed LedgerRow: no spec, no pid. */
export interface JobView {
  id: number;
  verb: string;
  target: string;
  state: LedgerState;
  note: string | null;
  /** Recorded output paths and URLs. */
  artifacts: string[];
  /** The app route this action changed, when known. The "see it live" link. */
  route: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

/** An item that genuinely needs the human. Slice 2 fills this; the shape lands now
 * so the stream contract does not change under the client later. */
export interface AttentionItem {
  id: string;
  /** Where it came from ("agent question", "review ask", "update available"). */
  kind: string;
  /** The surface it concerns. */
  source: string;
  /** What is being asked, in plain language. */
  ask: string;
  /** ISO timestamp. */
  at: string;
}

export interface LedgerCounts {
  running: number;
  queued: number;
  failed: number;
  needsAnswer: number;
}

export interface LedgerSnapshot {
  counts: LedgerCounts;
  jobs: JobView[];
  /** Oldest first: the thing that has been waiting longest is the thing to answer. */
  attention: AttentionItem[];
  /** null when the database read succeeded. Otherwise a plain-language reason
   * the numbers above are not the truth. The UI renders it. */
  degraded: string | null;
  /** Server time when this snapshot was built. Client components format relative
   * times against THIS, so the server pass and the hydration pass agree instead
   * of computing "just now" and "1m ago" from two different clocks. */
  nowMs: number;
}

/** How many rows ride the stream. Without a bound the payload grows without limit
 * over months of use; older rows stay one GET away. */
export const JOBS_STREAMED = 50;

function toView(row: LedgerViewRow): JobView {
  return {
    id: row.id,
    verb: row.verb,
    target: row.target,
    state: row.state,
    note: row.note,
    artifacts: parseArtifacts(row.artifacts),
    route: row.route,
    created_at: row.created_at,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

/** The snapshot every live surface renders. Server-rendered pages pass it in as
 * the initial value, so first paint is never empty and the stream just takes over. */
export function ledgerSnapshot(): LedgerSnapshot {
  // One transaction: the counts and the rows must describe the same instant.
  // Two independent SELECTs let a write land between them, and the snapshot then
  // says "1 running" over a strip with no running row. It self-corrects in 1.5s,
  // which makes it a flicker nobody can ever reproduce.
  const read = readConsistently(() => ({
    states: ledgerStateCounts(),
    rows: recentLedgerRows(JOBS_STREAMED),
  }));
  return {
    counts: {
      running: read.states.running,
      queued: read.states.queued,
      failed: read.states.failed,
      needsAnswer: read.states["needs-answer"],
    },
    jobs: read.rows.map(toView),
    // Empty until slice 2 builds the attention queue. It renders as an honest
    // empty state, never as invented rows.
    attention: [],
    degraded: null,
    nowMs: Date.now(),
  };
}

/** A snapshot with nothing in it, carrying the reason there is nothing in it. */
export function emptySnapshot(degraded: string | null = null): LedgerSnapshot {
  return {
    counts: { running: 0, queued: 0, failed: 0, needsAnswer: 0 },
    jobs: [],
    attention: [],
    degraded,
    nowMs: Date.now(),
  };
}

/** What the SSE route diffs on. `nowMs` moves every tick by design, so diffing
 * the whole payload would emit on every single tick and the stream's
 * emit-only-on-change property would quietly stop existing. */
export function snapshotDiffKey(snap: LedgerSnapshot): string {
  return JSON.stringify({
    counts: snap.counts,
    jobs: snap.jobs,
    attention: snap.attention,
    degraded: snap.degraded,
  });
}

/** Without this the same message prints on every 1.5s tick of every stream. */
let lastLogged: string | null = null;

/** The snapshot, or an honestly degraded one if the database is unavailable.
 * Server surfaces use this: the hub failing to open its own database must not
 * blank the page, and must not pretend the page is simply empty either. */
export function safeLedgerSnapshot(): LedgerSnapshot {
  try {
    const snap = ledgerSnapshot();
    lastLogged = null;
    return snap;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (detail !== lastLogged) {
      lastLogged = detail;
      console.error(`[hub] the hub database could not be read: ${detail}`);
    }
    return emptySnapshot(
      "The hub cannot read its own database, so nothing below is real. " +
        "Check that the dataDir in your config exists and is writable. " +
        `The error was: ${detail}`,
    );
  }
}
