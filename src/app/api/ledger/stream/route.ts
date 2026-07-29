// The live ledger stream. One route, one snapshot function, and ?once=1 returns
// exactly the same JSON the stream emits (the poll fallback's contract).
import { sseResponse } from "@/lib/sse";
import { safeLedgerSnapshot, snapshotDiffKey } from "@/lib/stream";

export const dynamic = "force-dynamic";

// 1.5s ticks, with a forced emit roughly every 24s. The forced emit replaces a
// keepalive: it warms the pipe AND advances client-side clocks in one mechanism.
const TICK_MS = 1500;
const FORCE_EVERY = 16;

export function GET(request: Request): Promise<Response> {
  return sseResponse(request, {
    event: "ledger",
    tickMs: TICK_MS,
    forceEvery: FORCE_EVERY,
    snapshot: safeLedgerSnapshot,
    // The snapshot carries the server clock so client components can format
    // relative times without a hydration mismatch. That field moves every tick,
    // so the diff has to ignore it or nothing is ever "unchanged".
    diffKey: snapshotDiffKey,
  });
}
