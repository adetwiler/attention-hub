// MINT A GRANT. The only door in the hub that hands out permission to open a
// shell, and the one place a browser is involved at all.
//
// The request carries a pane id. That is the whole input. The directory, the
// session name and the shell come out of hub.config.json, resolved server side
// (src/lib/terminal.ts), so no browser and no page embedded in another site can
// ask for a directory or a command.
//
// SAME ORIGIN, ENFORCED. A page on any other site can POST to a loopback port
// from your browser, and if this route answered it, that site would hold a shell
// grant. It cannot forge an Origin header, so the check below is the thing that
// stops it. Origin must be present and must match the host the request came in
// on. That refusal is why this route, and not the sidecar, is the door.
//
// THE TOKEN IS RETURNED IN THE BODY AND NEVER PUT IN A URL. The client sends it
// as the first WebSocket message. A URL is written to history, to proxy logs and
// to referrer headers, and a single-use token in a log is still a token.
//
// EVERY MINT IS A LEDGER ROW. runThroughLedger records that a terminal was
// attached: which pane, which session. It records nothing that was typed, ever.
// A transcript of a shell is a secret-bearing file, and this product does not
// create one.
import os from "node:os";
import { loadConfig } from "@/lib/config";
import { runThroughLedger } from "@/lib/ledger";
import { grantFor, GRANT_TTL_SECONDS, mintToken, sidecarUrl, TERMINAL_MODULE } from "@/lib/terminal";
import { insertGrant, pruneGrants } from "@/lib/terminalGrants";

export const dynamic = "force-dynamic";

/** A refusal a human can act on, in the same shape every time. */
function no(status: number, problem: string): Response {
  return Response.json({ ok: false, problem }, { status });
}

/** Is this POST from the hub's own pages? Origin cannot be forged by a page, so
 * a mismatch is a cross-site attempt and gets nothing. A missing Origin is also
 * refused: browsers send it on every cross-origin POST, so its absence means the
 * caller is not the browser this route exists to serve. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Could this pane open a shell, and if not, why? MINTS NOTHING.
 *
 * It exists so a pane can say "the terminal module is switched off, and here is
 * what switching it on means" before anybody presses a button. A pane that looks
 * ready and then fails on click teaches the user to distrust the whole surface,
 * and the honest-state rule covers a pane that cannot connect too.
 *
 * Read-only, same-origin not required: it hands back a sentence about the user's
 * own config and no authority whatsoever. */
export function GET(request: Request): Response {
  const paneId = new URL(request.url).searchParams.get("paneId");
  if (paneId === null || paneId === "") return no(400, "Expected a paneId.");
  const resolved = grantFor(loadConfig(), paneId, os.homedir());
  return Response.json({
    ready: resolved.problem === null,
    problem: resolved.problem,
    ownerOnly: TERMINAL_MODULE.ownerOnly,
    platforms: TERMINAL_MODULE.platforms,
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return no(403, "This request did not come from the hub's own pages, so it gets no terminal grant.");
  }

  let paneId: unknown;
  try {
    const body: unknown = await request.json();
    paneId = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["paneId"] : undefined;
  } catch {
    return no(400, "Expected a JSON body with a paneId.");
  }
  if (typeof paneId !== "string" || paneId === "") {
    return no(400, "Expected a JSON body with a paneId.");
  }

  const config = loadConfig();
  const resolved = grantFor(config, paneId, os.homedir());
  if (resolved.problem !== null) {
    // Switched off, wrong platform, unknown pane, missing folder: all of them are
    // things the user can fix, and all of them say which key. 409 rather than 500
    // because nothing here is broken.
    return no(409, resolved.problem);
  }

  const grant = resolved.grant;
  const token = mintToken();
  const run = await runThroughLedger("terminal-attach", `pane ${grant.paneId}`, false, async () => {
    pruneGrants();
    return {
      ok: true,
      message: `attached a terminal to ${grant.session} in ${grant.cwd}`,
      artifacts: [],
    };
  });
  insertGrant(token, grant, run.ledgerId);

  return Response.json({
    ok: true,
    token,
    url: sidecarUrl(config.terminal),
    session: grant.session,
    cwd: grant.cwd,
    tmux: grant.tmux,
    idleMinutes: grant.idleMinutes,
    expiresInSeconds: GRANT_TTL_SECONDS,
    ownerOnly: TERMINAL_MODULE.ownerOnly,
  });
}
