"use client";
// The shared-connection SSE hook factory.
//
// Each call to makeStreamHook owns ONE module-level hub, so every subscriber on
// the page shares ONE EventSource. Three components subscribing does not open
// three streams.
//
// HEALTH IS OBSERVED, NEVER GUESSED. An error event turns polling on; the next
// stream event turns it off. EventSource retries on its own, and the poll just
// bridges the gap by fetching the stream's ?once=1 snapshot, which is the same
// shape by contract (see src/lib/sse.ts). A failed poll keeps the last known
// truth on screen rather than blanking the UI.
import { useEffect, useState } from "react";

const POLL_FALLBACK_MS = 5000;

interface StreamHub<T> {
  es: EventSource | null;
  poll: number | null;
  subs: Set<(snap: T) => void>;
  last: T | null;
}

/** Build a shared-connection hook for one stream URL and named event. */
export function makeStreamHook<T>(streamUrl: string, eventName: string): (initial: T) => T {
  const hub: StreamHub<T> = { es: null, poll: null, subs: new Set(), last: null };

  const notify = (snap: T): void => {
    hub.last = snap;
    for (const fn of hub.subs) fn(snap);
  };

  const stopPolling = (): void => {
    if (hub.poll === null) return;
    window.clearInterval(hub.poll);
    hub.poll = null;
  };

  const startPolling = (): void => {
    if (hub.poll !== null) return;
    hub.poll = window.setInterval(() => {
      // The marker below must sit on the fetch line itself: the no-telemetry
      // gate reads one line at a time.
      fetch(`${streamUrl}?once=1`) // hub-allow-network: same-origin call to this hub's own stream endpoint. Nothing leaves the machine.
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .then((snap) => {
          if (snap !== null) notify(snap);
        })
        .catch(() => undefined); // unreachable hub: keep the last truth on screen
    }, POLL_FALLBACK_MS);
  };

  const connect = (): void => {
    if (hub.es !== null) return;
    const es = new EventSource(streamUrl); // hub-allow-network: same-origin stream from this hub's own route. Nothing leaves the machine.
    es.addEventListener(eventName, (e) => {
      stopPolling(); // the stream is alive, so it is the truth channel again
      try {
        notify(JSON.parse((e as MessageEvent<string>).data) as T);
      } catch {
        // a torn frame is dropped; the next tick resends the whole snapshot
      }
    });
    es.onerror = () => startPolling();
    hub.es = es;
  };

  const disconnect = (): void => {
    hub.es?.close();
    hub.es = null;
    stopPolling();
  };

  return function useStream(initial: T): T {
    const [snap, setSnap] = useState<T>(hub.last ?? initial);
    useEffect(() => {
      hub.subs.add(setSnap);
      if (hub.last !== null) setSnap(hub.last);
      connect();
      return () => {
        hub.subs.delete(setSnap);
        if (hub.subs.size === 0) disconnect();
      };
      // Mount and unmount only, on purpose: the hub is module state, not props,
      // so there is nothing for this effect to depend on. (No eslint directive
      // here: there is no eslint config in this repo, and a comment addressed to
      // a tool that does not exist reads as "linting happens here" to the next
      // person.)
    }, []);
    return snap;
  };
}
