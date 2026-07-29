// THE BROWSER PANE, state side. Which profiles exist, which have been seeded, whether a
// browser is installed, whether this platform is supported and whether the sidecar is up.
//
// It exists so the pane can render an HONEST state instead of a socket that hangs. Every one
// of those five answers is a different sentence for the user, and the pane prints the one
// that is true. BROKEN IS NOT EMPTY applies here in its sharpest form: a browser pane with
// nothing in it and no explanation is indistinguishable from a broken one.
import { NextResponse } from "next/server";
import { browserSidecarHealth, browserState } from "@/lib/browser";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const state = browserState();
  const health = await browserSidecarHealth();
  return NextResponse.json({ ok: true, ...state, sidecar: health });
}
