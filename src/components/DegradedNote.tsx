"use client";
// BROKEN IS NOT EMPTY. If the hub cannot read its own database, every count is
// zero and every list is empty, which is indistinguishable from a healthy fresh
// install. This card is the difference. It renders off the live stream rather
// than only the first server pass, because a database can go away mid-session:
// the folder gets moved, the disk fills, a file gets locked.
//
// It renders nothing at all when the snapshot is healthy. An always-visible
// "everything is fine" banner is noise, and noise is what this product exists
// to remove.
import type { LedgerSnapshot } from "@/lib/stream";
import { useLedgerStream } from "./useLedgerStream";

export default function DegradedNote({ initial }: { initial: LedgerSnapshot }) {
  const degraded = useLedgerStream(initial).degraded;
  if (degraded === null) return null;

  return (
    <section className="card note bad">
      <span className="hd">Database problem</span>
      <p className="empty">{degraded}</p>
    </section>
  );
}
