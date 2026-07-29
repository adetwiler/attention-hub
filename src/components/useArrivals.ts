"use client";
// WHAT JUST ARRIVED. The one definition of "new" in the product.
//
// It exists as its own hook, rather than as a few lines inside the toast stack,
// because "new" is a decision with two halves that are easy to get individually
// right and collectively wrong:
//
//   1. THE FIRST SNAPSHOT IS A BASELINE, NEVER A STORM. Whatever is already
//      waiting when you open the page belongs to the QUEUE, not to an interrupt.
//      Opening the hub with nine open items must not fire nine notifications, and
//      that is not a nicety: a surface that shouts on every page load is a
//      surface people close, and then the one item that mattered goes unseen.
//
//   2. AN ITEM IS NEW EXACTLY ONCE. The seen set is a ref, not state, so a
//      re-render cannot re-announce anything, and a stream tick that changed
//      something else entirely cannot either.
//
// It deliberately knows NOTHING about quiet hours. Quiet is the toast stack's
// policy, and encoding it here would force it on every future surface that wants
// to know what arrived (a sound, a badge, a pane peek) whether that suits it or
// not. This hook answers one question and leaves the decision upstream.
import { useEffect, useRef, useState } from "react";
import type { AttentionItem } from "@/lib/feed";

/** The items that appeared since the last tick. The identity of the returned
 * array changes only when something actually arrives, so an effect depending on
 * it fires once per batch rather than once per tick. */
export function useArrivals(items: AttentionItem[]): AttentionItem[] {
  const seen = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<AttentionItem[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      // The baseline. Everything present at this instant is already known.
      seen.current = new Set(items.map((item) => item.id));
      return;
    }
    const known = seen.current;
    const fresh: AttentionItem[] = [];
    for (const item of items) {
      if (known.has(item.id)) continue;
      known.add(item.id);
      fresh.push(item);
    }
    if (fresh.length > 0) setArrivals(fresh);
  }, [items]);

  return arrivals;
}
