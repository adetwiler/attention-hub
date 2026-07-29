"use client";
// The two small pieces the toast and the card both render, kept in one place so
// the same item cannot describe itself differently depending on where you see it.
//
// THE LABELS CARRY A PROMISE, so they are worth being fussy about:
//
//   ASKS YOU   a question. Something is waiting on your answer to continue.
//   REPORT     a notice. It was filed for you to see, it wants triage, and it is
//              NOT asking you anything. A wall of rows saying "asks you" over
//              things that are not asking you is how a needs-you surface stops
//              being believed, and it is the exact complaint that produced this
//              third kind upstream.
//   DECIDE     a review ask. Look, then mark it handled.
import { relTime } from "@/lib/time";
import type { AttentionKind } from "@/lib/feed";

const LABELS: Record<AttentionKind, string> = {
  "agent-question": "ASKS YOU",
  "agent-notice": "REPORT",
  "review-ask": "DECIDE",
};

/** The kind, as a tag. The colour is state, which is the only thing colour
 * means in this interface: a question is the one that blocks something. */
export function KindTag({ kind }: { kind: AttentionKind }) {
  return <span className={kind === "agent-question" ? "tag need" : "tag"}>{LABELS[kind]}</span>;
}

/** Who filed it and how long ago. Absent parts render as nothing rather than as
 * a plausible guess, and the relative time is measured against the SNAPSHOT's
 * clock, never the browser's, or the server pass and the hydration pass disagree
 * over anything near a bucket boundary. */
export function ItemMeta({ source, at, nowMs }: { source: string | null; at: string; nowMs: number }) {
  const ms = Date.parse(at);
  const when = Number.isNaN(ms) ? at : relTime(ms, nowMs);
  if (source === null && when.length === 0) return null;
  return (
    <span className="who">
      {source !== null ? source : ""}
      {source !== null && when.length > 0 ? " / " : ""}
      {when}
    </span>
  );
}
