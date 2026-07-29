// THE BROWSER PANE, remote control. POST {action, profile?} and the sidecar pushes it to the
// open panes, so turning FOLLOW on (or raising the real window) is something an AI session can
// do for you rather than a button you have to go and find.
//
// The hub cannot reach a pane directly: a pane holds a socket to the SIDECAR, not to Next. So
// this forwards over loopback. The action set is validated on BOTH sides deliberately. The
// sidecar must never become a passthrough into a surface someone is looking at, and the hub
// refusing early is what produces a message a human can act on.
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { browserSidecarHealth, findProfile } from "@/lib/browser";

export const dynamic = "force-dynamic";

/** Deliberately tiny and named. Not a passthrough, and never a kill path: nothing here can
 * quit a browser or close a tab. */
const ACTIONS = new Set(["follow-on", "follow-off", "window", "park"]);

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "body must be JSON" }, { status: 400 });
  }
  const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const action = typeof rec["action"] === "string" ? rec["action"] : "";
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { ok: false, message: `unknown action "${action}", one of ${[...ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }
  const profile = typeof rec["profile"] === "string" ? rec["profile"] : "";
  if (profile.length > 0 && findProfile(profile) === null) {
    return NextResponse.json({ ok: false, message: `there is no browser profile "${profile}"` }, { status: 400 });
  }

  const health = await browserSidecarHealth();
  if (!health.up) {
    return NextResponse.json(
      { ok: false, message: `the browser sidecar is not running: ${health.why}` },
      { status: 503 },
    );
  }

  const port = loadConfig().browser.sidecarPort;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/command`, { // hub-allow-network: loopback only, this hub's own sidecar on this machine.
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, profile }),
      signal: AbortSignal.timeout(4000),
    });
    const answer: unknown = await res.json();
    return NextResponse.json(answer, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: `could not reach the sidecar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
