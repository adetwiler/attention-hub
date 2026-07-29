// SPEND A GRANT. Called by the pty sidecar over loopback, never by a browser.
//
// This is what keeps the sidecar out of the database. src/lib/db.ts states the
// rule that only the web process ever opens the SQLite file (that is what makes
// WAL safe here), so the sidecar cannot check a token itself. It asks, over
// loopback, and gets back the grant that was minted: the pane, the session name,
// the directory, the shell.
//
// The consequence worth naming: the sidecar takes NO working directory and NO
// command from the client. It sends a token and is told where to open. A client
// that lies gets a shell in the directory config says, or nothing.
//
// AUTHORITY IS THE TOKEN, AND IT IS SINGLE USE. Anyone holding it could open the
// socket anyway, so this route deliberately does not add a second secret it would
// have to store on disk. What it does add: the redemption is the moment the grant
// is spent, so a replayed token is refused here rather than at the pty.
//
// THE SPAWNED SESSION IS A LEDGER ROW. The mint records the attach; this records
// the session that the attach actually produced, with the tmux name in the note,
// so the ledger answers "what did the hub run" without recording a keystroke.
import { runThroughLedger } from "@/lib/ledger";
import { looksLikeToken } from "@/lib/terminal";
import { redeemGrant } from "@/lib/terminalGrants";

export const dynamic = "force-dynamic";

function no(status: number, problem: string): Response {
  return Response.json({ ok: false, problem }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let token: unknown;
  try {
    const body: unknown = await request.json();
    token = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["token"] : undefined;
  } catch {
    return no(400, "Expected a JSON body with a token.");
  }
  // Shape first: a malformed value is refused without a database round trip.
  if (!looksLikeToken(token)) return no(400, "That is not a grant token.");

  const result = redeemGrant(token);
  if (result.problem !== null) return no(403, result.problem);

  const grant = result.grant;
  await runThroughLedger("terminal-session", `pane ${grant.paneId}`, false, async () => ({
    ok: true,
    message: grant.tmux
      ? `opened the tmux session ${grant.session} in ${grant.cwd}`
      : `opened a shell in ${grant.cwd} (raw pty, no tmux, so it ends with the socket)`,
    artifacts: [],
  }));

  return Response.json({
    ok: true,
    paneId: grant.paneId,
    session: grant.session,
    cwd: grant.cwd,
    shell: grant.shell,
    tmux: grant.tmux,
    scrollback: grant.scrollback,
    idleMinutes: grant.idleMinutes,
  });
}
