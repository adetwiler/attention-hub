"use client";
// THE INTERRUPT CHANNEL, and every rule that keeps it trustworthy.
//
// Mounted ONCE, in the shell, so it is on every room. That is the point: the
// value of the hub is not that TODAY has a list, it is that you find out while
// you are looking at something else.
//
//   ONLY NEEDS-YOU ITEMS CAN TOAST, by construction rather than by filter. The
//   feed contains nothing but items that need a human, so there is no code path
//   by which "a job finished" could ever appear here. Progress and completions
//   live in the jobs strip and cannot reach this component.
//
//   A PAGE LOAD IS NEVER A STORM. The first snapshot is a baseline (useArrivals),
//   so what was already waiting belongs to the queue, and only what arrives
//   while you are here interrupts you.
//
//   AT MOST THREE, and the rest is a count. A stack that grows without limit
//   covers the work you were doing, which turns the feature into something to
//   escape from. The overflow line points at the card, which is the surface
//   built to hold a hundred of them.
//
//   QUIET SUPPRESSES THE SURFACE AND NEVER THE DATA. While quiet, arrivals are
//   baselined in silence: nothing pops up, the queue fills normally, and when
//   quiet lifts NOTHING BACK-FIRES. A held-up storm arriving at 6am would be
//   strictly worse than the interruption it avoided.
//
//   "LATER" MEANS LATER. Dismissing a toast is local and forgets nothing: the
//   item is still in the feed, still on the card, still unanswered. There is no
//   endpoint behind this button, which is why it is safe to press.
import { useEffect, useState } from "react";
import type { LedgerSnapshot } from "@/lib/stream";
import type { AttentionItem } from "@/lib/feed";
import { ItemMeta, KindTag } from "./AttentionBits";
import InlineAnswer from "./InlineAnswer";
import { useArrivals } from "./useArrivals";
import { useLedgerStream } from "./useLedgerStream";

/** Three. Beyond that the stack is in the way of the work. */
const MAX_SHOWN = 3;
/** How long the confirmation after an answer stays. Long enough to read. */
const NOTE_MS = 6000;

export default function AttentionToasts({ initial }: { initial: LedgerSnapshot }) {
  const snap = useLedgerStream(initial);
  const items = snap.attention;
  const quiet = snap.quiet;
  const arrivals = useArrivals(items);
  const [toasts, setToasts] = useState<AttentionItem[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    // Quiet: the arrival was already baselined by the hook, so doing nothing
    // here is exactly right. It is in the queue and it is not on screen.
    if (quiet.quietNow || arrivals.length === 0) return;
    setToasts((current) => [...current, ...arrivals]);
  }, [arrivals, quiet.quietNow]);

  useEffect(() => {
    // Answered somewhere else (the card, another tab, the CLI): the toast for it
    // goes away with it. Identity is preserved when nothing changed so this
    // cannot loop on itself.
    setToasts((current) => {
      const alive = current.filter((toast) => items.some((item) => item.id === toast.id));
      return alive.length === current.length ? current : alive;
    });
  }, [items]);

  const dismiss = (id: string): void => setToasts((current) => current.filter((t) => t.id !== id));

  const done = (id: string, message: string): void => {
    dismiss(id);
    setNote(message);
    window.setTimeout(() => setNote(null), NOTE_MS);
  };

  const shown = toasts.slice(0, MAX_SHOWN);
  const overflow = toasts.length - shown.length;
  if (shown.length === 0 && note === null) return null;

  return (
    <div className="toasts" aria-live="polite">
      {note !== null ? (
        <div className="toast quiet-note">
          <span className="empty">{note}</span>
        </div>
      ) : null}

      {shown.map((item) => (
        <div className="toast" key={item.id}>
          <div className="toast-head">
            <KindTag kind={item.kind} />
            <ItemMeta source={item.source} at={item.at} nowMs={snap.nowMs} />
            <button
              type="button"
              className="btn"
              title="Later. It stays in Waiting for you, unanswered."
              onClick={() => dismiss(item.id)}
            >
              later
            </button>
          </div>
          <p className="ask">{item.ask}</p>
          <InlineAnswer item={item} onDone={(message) => done(item.id, message)} />
        </div>
      ))}

      {overflow > 0 ? (
        <div className="toast quiet-note">
          <span className="empty">
            and {overflow} more waiting. Today leads with the whole list, oldest first.
          </span>
        </div>
      ) : null}
    </div>
  );
}
