"use client";
// The one live stream every surface in the hub subscribes to. One EventSource,
// one snapshot shape, one place the URL and event name are written down.
import { makeStreamHook } from "./useEventStream";
import type { LedgerSnapshot } from "@/lib/stream";

export const LEDGER_STREAM_URL = "/api/ledger/stream";
export const LEDGER_EVENT = "ledger";

export const useLedgerStream = makeStreamHook<LedgerSnapshot>(LEDGER_STREAM_URL, LEDGER_EVENT);
