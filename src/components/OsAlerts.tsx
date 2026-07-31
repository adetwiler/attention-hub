"use client";
// THE OTHER HALF OF THE INTERRUPT CHANNEL - the one that works when the tab is not in front.
//
// AttentionToasts is honest about its own limit: it interrupts you while you are LOOKING at
// the hub. Most of the time you are not, and a hub whose whole premise is "you find out while
// you are doing something else" cannot only reach you on the surface you already have open.
// This raises a real OS banner for the same arrivals, through the same rules.
//
// HEADLESS ON PURPOSE. It renders null. Delivery is one job with one owner, and pinning it to
// the toast stack would mean that redesigning the toasts (a normal thing to want) silently
// redesigns the alert channel too.
//
// IT REUSES RATHER THAN REBUILDS, and each of these would have been a bug as a copy:
//   - useArrivals for "what is new". A second definition of new is the one that fires at 2am.
//   - the SHARED ledger stream (useEventStream refcounts one EventSource), so subscribing
//     here opens no second connection.
//   - the same quiet rule the toasts follow, below, for the same reason.
//
// EVERY RULE THE TOASTS OBEY, THIS OBEYS - it is strictly louder, never different:
//   A PAGE LOAD IS NEVER A STORM. The first snapshot is a baseline (useArrivals), so opening
//   the hub with nine open items raises zero banners. Verify this by counting what fires
//   DURING a load, never by reading the notification center, which also holds leftovers from
//   before and will make a working build look broken.
//
//   QUIET SUPPRESSES THE SURFACE AND NEVER THE DATA, and nothing back-fires when it lifts.
//   Arrivals are baselined by the hook whether we announce them or not, so a night of held-up
//   items cannot arrive as a stack of banners at 6am - which would be strictly worse than the
//   interruptions it avoided.
import { useEffect } from "react";
import type { LedgerSnapshot } from "@/lib/stream";
import { deliver, setQueueBadge } from "@/lib/alert-channel";
import { ensureServiceWorker } from "@/lib/service-worker";
import { useArrivals } from "./useArrivals";
import { useLedgerStream } from "./useLedgerStream";

export default function OsAlerts({ initial }: { initial: LedgerSnapshot }): null {
  const snap = useLedgerStream(initial);
  const items = snap.attention;
  const quiet = snap.quiet;
  const arrivals = useArrivals(items);
  const waiting = items.length;

  // THIS COMPONENT REGISTERS THE WORKER because it always mounts. See lib/service-worker.ts
  // for the mistake that rule comes from.
  useEffect(() => {
    ensureServiceWorker();
  }, []);

  // The badge tracks the QUEUE, so it comes back down as you answer. Its own effect, keyed on
  // the count rather than on arrivals, because those are two different questions.
  useEffect(() => {
    setQueueBadge(waiting);
  }, [waiting]);

  useEffect(() => {
    // Quiet: the arrival was already baselined by the hook, so doing nothing here is exactly
    // right. It is in the queue, and it is not on your screen or in your notifications.
    if (quiet.quietNow || arrivals.length === 0) return;
    deliver(
      arrivals.map((item) => ({
        // The source when the row named one, because "who is asking" is most of what you need
        // to decide whether to look now. Nothing invented when it did not.
        title: item.source === null ? "Needs you" : `Needs you: ${item.source}`,
        body: item.ask,
      })),
    );
  }, [arrivals, quiet.quietNow]);

  return null;
}
