// The server-sent-events route helper. Every live stream in the hub uses this
// one shape, and every stream therefore honours the same contract:
//
//   ?once=1 RETURNS THE IDENTICAL SNAPSHOT AS PLAIN JSON.
//
// That is a contract, not a courtesy. It is what makes the client's poll
// fallback trivial and, more importantly, structurally correct: one snapshot()
// function feeds both branches, so the fallback can never serve a different
// shape than the stream. Two code paths here means the difference only shows up
// once the stream is already broken, which is the worst possible time.
//
// The other rules worth stating:
//
//   AN UNCHANGED SNAPSHOT EMITS NOTHING. A periodic forced emit keeps the pipe
//   warm and advances client-side clocks in one mechanism, which is why there
//   is no separate keepalive. An SSE comment keepalive (": keepalive") is
//   invisible to EventSource and cannot serve as a health signal, so it is not
//   used here. forceEvery is validated on entry: a stream author passing 0
//   would get `ticks % 0` = NaN, the forced emit would never fire, and the
//   keepalive this file argues replaces a keepalive would silently not exist.
//
//   TICKS NEVER OVERLAP. snapshot() may be async (a later stream reads
//   transcript files), so the loop is a chained setTimeout with an in-flight
//   guard rather than setInterval. With setInterval, a snapshot slower than
//   tickMs stacks work with no backpressure, and out-of-order resolution emits
//   the OLDER payload last and then records ITS key as the baseline, so the
//   next genuine change can be diffed against the wrong thing.
import { NextResponse } from "next/server";

export interface SseRouteOptions<T> {
  /** The named event the client hook subscribes to. */
  event: string;
  tickMs: number;
  /** Force an emit every N ticks even when nothing changed. Must be 1 or more. */
  forceEvery: number;
  /** Build the snapshot. A throw skips the tick; it never kills the stream. */
  snapshot: () => T | Promise<T>;
  /** Diff on this string instead of the serialized payload. Any volatile field
   * (a clock, an uptime, an elapsed count) "changes" every tick and defeats
   * diffing entirely, so zero it out here. */
  diffKey?: (data: T) => string;
}

/** Answer a stream GET: ?once=1 gives one JSON snapshot, otherwise the diff stream. */
export async function sseResponse<T>(
  request: Request,
  opts: SseRouteOptions<T>,
): Promise<Response> {
  if (!Number.isInteger(opts.forceEvery) || opts.forceEvery < 1) {
    throw new Error(`sseResponse: expected a whole number 1 or more at "forceEvery", got ${String(opts.forceEvery)}`);
  }
  if (!Number.isInteger(opts.tickMs) || opts.tickMs < 1) {
    throw new Error(`sseResponse: expected a whole number 1 or more at "tickMs", got ${String(opts.tickMs)}`);
  }

  if (new URL(request.url).searchParams.get("once") === "1") {
    return NextResponse.json(await opts.snapshot());
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let last = "";
      let ticks = 0;
      let open = true;

      const close = (): void => {
        if (!open) return;
        open = false;
        if (timer !== null) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // the runtime may have closed it already
        }
      };

      const write = (frame: string): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          close(); // the client went away mid-write
        }
      };

      const send = async (): Promise<void> => {
        let body: string;
        let key: string;
        try {
          const data = await opts.snapshot();
          body = JSON.stringify(data);
          key = opts.diffKey !== undefined ? opts.diffKey(data) : body;
        } catch {
          return; // a snapshot hiccup skips a tick, it never kills the stream
        }
        ticks += 1;
        if (key !== last || ticks % opts.forceEvery === 0) {
          last = key;
          write(`event: ${opts.event}\ndata: ${body}\n\n`);
        }
      };

      // Chained, not periodic: the next tick is scheduled only after this one
      // has settled, so two snapshots can never be in flight at once.
      const loop = (): void => {
        void send().finally(() => {
          if (!open) return;
          timer = setTimeout(loop, opts.tickMs);
        });
      };

      loop();
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // nginx buffers proxied responses by default and does not exempt
      // text/event-stream. The config file names a reverse proxy as a supported
      // way to reach the hub, and without this such a user sees a page that
      // renders correctly and then updates only via the 5s poll fallback, or
      // never. It presents as "the live updates feel laggy", which is the
      // hardest class of bug to report. Harmless when there is no proxy.
      "x-accel-buffering": "no",
    },
  });
}
