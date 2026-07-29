"use client";
// The jobs strip: what the hub is doing right now, and what it just finished.
//
// Every row is an action_ledger row (there is no separate job history), which
// is why this renders straight off the shared snapshot with no fetching of its
// own. Empty is the honest state on a fresh install and it says so.
//
// RELATIVE TIMES USE THE SNAPSHOT'S CLOCK, NEVER Date.now(). This is a client
// component that also renders on the server, so a row sitting near a bucket
// boundary would say "just now" in the server HTML and "1m ago" after
// hydration, which React reports as a text mismatch and repairs by re-rendering.
// The snapshot carries `nowMs`, both passes read the same number, and they
// agree. It is invisible today only because the ledger is empty, which is
// exactly why it would have landed later as a mystery console error.
import type { LedgerSnapshot } from "@/lib/stream";
import { relTimeFromSqlite } from "@/lib/time";
import { useLedgerStream } from "./useLedgerStream";

/** Which state dot a row gets. Unknown states fall back to the neutral dot. */
function dotClass(state: string): string {
  if (state === "running" || state === "queued") return "st run";
  if (state === "done") return "st done";
  if (state === "failed" || state === "needs-answer") return "st need";
  return "st";
}

export default function JobsStrip({ initial }: { initial: LedgerSnapshot }) {
  const snap = useLedgerStream(initial);
  const { jobs, nowMs } = snap;

  return (
    <section className="card">
      <span className="hd">Jobs</span>

      {jobs.length === 0 ? (
        <p className="empty">
          No jobs yet. Anything the hub runs for you shows up here while it runs,
          and stays here afterwards with a link to whatever it produced.
        </p>
      ) : (
        jobs.map((job) => (
          <span key={job.id} className="job">
            <span className={dotClass(job.state)} />
            <span className="job-verb">
              {job.verb}: {job.target}
            </span>
            <span className="job-meta">
              {job.state}
              {job.ended_at !== null ? ` / ${relTimeFromSqlite(job.ended_at, nowMs)}` : ""}
            </span>
          </span>
        ))
      )}
    </section>
  );
}
