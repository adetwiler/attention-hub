// THE BROWSER PANE, open side. POST {profile, pane, url?} mints the single-use token the
// socket must present.
//
// The security story on the hub's side:
//   - the GRANT (which profile, which pane, which URL) is written into the token ROW, so a
//     token that leaks cannot be re-pointed at a different profile's signed-in browser,
//   - the token is short-TTL and is burned by the sidecar on connect,
//   - opening a pane is a LEDGERED row (`open-browser`), because the one-history rule has no
//     exceptions. The row records that a browser was opened ON A PROFILE and nothing else:
//     no page titles, no history, no URLs beyond the one that was asked for. A browsing log
//     is the one thing this product promises never to keep.
//
// It also REFUSES EARLY, with the fix in the message, in four separate cases. Minting a token
// for a socket that can never open leaves the pane saying "opening..." forever, and a hang
// looks like progress, which is worse than an error.
import { NextResponse } from "next/server";
import { runThroughLedger } from "@/lib/ledger";
import { browserSidecarHealth, browserState, findProfile, mintBrowserToken } from "@/lib/browser";
import { resolveInput } from "@/lib/weburl";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "body must be JSON" }, { status: 400 });
  }
  const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const state = browserState();

  if (!state.supported) {
    return NextResponse.json({ ok: false, message: state.unsupportedWhy }, { status: 501 });
  }
  if (!state.browserInstalled) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "No Chrome or Chromium was found on this machine, so there is no browser to mirror. Install one, or add its path under \"browser.browsers\" in hub.config.json.",
      },
      { status: 503 },
    );
  }

  const wantProfile = typeof rec["profile"] === "string" ? rec["profile"] : "";
  const profile = findProfile(wantProfile);
  if (profile === null) {
    const known = state.profiles.map((p) => p.id).join(", ");
    return NextResponse.json(
      {
        ok: false,
        message:
          known.length > 0
            ? `There is no browser profile "${wantProfile}". Configured profiles are: ${known}.`
            : "No browser profiles are configured. Add one under \"browser.profiles\" in hub.config.json, then restart the hub.",
      },
      { status: 400 },
    );
  }
  if (!profile.installed) {
    return NextResponse.json(
      {
        ok: false,
        message: `${profile.label} is set to run in "${profile.browser}", and that browser was not found. Check "browser.browsers.${profile.browser}" in hub.config.json.`,
      },
      { status: 503 },
    );
  }
  if (!profile.seeded) {
    // NAME THE COMMAND. An un-seeded profile is the single most likely first-run state, and
    // "it did not work" with no next step is how a feature gets abandoned.
    return NextResponse.json(
      {
        ok: false,
        message: `${profile.label} has no browser yet. Chrome has refused to be driven on its default data directory since Chrome 136, so the hub keeps its own copy instead of touching the browser you use. Quit ${profile.browser} completely, then run: node scripts/seed-browser-profile.mjs ${profile.id}`,
      },
      { status: 409 },
    );
  }

  const health = await browserSidecarHealth();
  if (!health.up) {
    return NextResponse.json(
      { ok: false, message: `The browser sidecar is not running: ${health.why}` },
      { status: 503 },
    );
  }

  const pane = typeof rec["pane"] === "string" && rec["pane"].length > 0 ? rec["pane"].slice(0, 64) : "browser";
  const url = resolveInput(typeof rec["url"] === "string" ? rec["url"] : "", state);

  const run = await runThroughLedger("open-browser", profile.id, false, async () => ({
    ok: true,
    message: `browser pane on ${profile.label}`,
    artifacts: [],
  }));

  const token = mintBrowserToken({ profile: profile.id, pane, url });
  return NextResponse.json({
    ok: true,
    token,
    sidecarPort: state.sidecarPort,
    profile: profile.id,
    label: profile.label,
    url,
    ledgerId: run.ledgerId,
  });
}
