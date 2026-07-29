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
import { attentionQueue, quietState } from "./attention";
import { ledgerStateCounts, parseArtifacts, readConsistently, recentLedgerRows } from "./db";
import type { LedgerState, LedgerViewRow } from "./db";
import type { AttentionItem } from "./feed";
import { QUIET_DEFAULT } from "./quiet";
import type { QuietState } from "./quiet";

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

// The attention item's shape is the FEED's shape, not a second one: it is
// defined by the public JSONL contract (src/lib/feed.ts, docs/attention-feed.md)
// and re-exported here so a client component can keep importing it from the
// snapshot module it already imports. Two declarations of this type would be two
// answers to "what is an attention item", and the wire would eventually carry
// one while the components rendered the other.
export type { AttentionItem } from "./feed";

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
  /** The one flag every attention-grabbing surface obeys. It rides the snapshot
   * rather than being fetched separately so the toast stack decides whether to
   * fire from the SAME payload that told it something arrived. Two round trips
   * means a window in which an item is known and the quiet state is not, and a
   * toast fires in that window every time. */
  quiet: QuietState;
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
  // THE FEED IS READ FIRST, and it is read from a file rather than from SQLite.
  // That ordering is deliberate: what needs you is the one thing on this page
  // that is worth showing even when the rest of the hub is unwell.
  const feed = attentionQueue();
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
    attention: feed.items,
    quiet: quietState(),
    // ONE degraded channel, shared. A feed the hub cannot parse is exactly as
    // load bearing as a database it cannot open, and a second field would mean
    // a second place every surface has to remember to render.
    degraded: feed.error,
    nowMs: Date.now(),
  };
}

/** A snapshot with nothing in it, carrying the reason there is nothing in it. */
export function emptySnapshot(degraded: string | null = null): LedgerSnapshot {
  return {
    counts: { running: 0, queued: 0, failed: 0, needsAnswer: 0 },
    jobs: [],
    attention: [],
    // The stored schedule is in the database, and this snapshot exists because
    // the database could not be read, so the documented default is the honest
    // answer. It is also the safe one: it never claims to be quiet.
    quiet: { manual: false, ...QUIET_DEFAULT, scheduled: false, quietNow: false },
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
    quiet: snap.quiet,
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
    const fallback = emptySnapshot(
      "The hub cannot read its own database, so the jobs and the counts below are not real. " +
        "Check that the dataDir in your config exists and is writable. " +
        `The error was: ${detail}`,
    );
    // The attention feed is a FILE, so it is very likely still readable, and it
    // is the one thing on the page worth showing anyway: a hub with a broken
    // database can still tell you what is waiting, even though it cannot record
    // your answer. Never swap a readable list for an empty one just because
    // something else failed.
    try {
      fallback.attention = attentionQueue().items;
    } catch {
      // then there is genuinely nothing to show, and the reason is already above
    }
    return fallback;
  }
}
