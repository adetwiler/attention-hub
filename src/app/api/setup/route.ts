// SAVE THE SETUP FORM. The only route in the hub that writes hub.config.json.
//
// SAME ORIGIN, ENFORCED, for the same reason the terminal grant route enforces
// it: the hub has no login, and a page on any other site can POST to a loopback
// port from your browser. Writing config is not a shell, but a route that can
// repoint dataDir is not a route to leave open to any tab you happen to have.
//
// FOUR FIELDS, AND THE PICKER CANNOT NAME A NEW BINARY. The body carries a hub
// name, a data folder, a port and the KEY of an agent the config already
// declares. src/lib/setup-config.ts is where that last rule is enforced and why.
//
// EVERY WRITE IS A LEDGER ROW, like every other mutation in this hub. Which
// means a config the loader refuses BLOCKS the save rather than skipping the
// ledger: runThroughLedger reads hub.actor out of the config, so a config it
// cannot parse has no actor to record the row against. Refusing with the
// loader's own message is more useful than an unledgered write, and the form
// says which key to fix.
import { loadConfig } from "@/lib/config";
import { runThroughLedger } from "@/lib/ledger";
import { sameOrigin } from "@/lib/same-origin";
import { writeSetupValues } from "@/lib/setup-config";
import type { SetupValues } from "@/lib/setup-config";

export const dynamic = "force-dynamic";

/** A refusal a human can act on, in the same shape every time. */
function no(status: number, problem: string): Response {
  return Response.json({ ok: false, problem }, { status });
}

/** The submitted body, or null when it is not the shape this route takes. No
 * coercion: a port arriving as the string "2886" is a client bug, and quietly
 * repairing it here would hide it while the next client did something else. */
function readBody(raw: unknown): SetupValues | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const { name, dataDir, port, agent } = body;
  if (typeof name !== "string" || typeof dataDir !== "string") return null;
  if (typeof port !== "number") return null;
  if (agent !== null && typeof agent !== "string") return null;
  return { name, dataDir, port, agent };
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return no(403, "This request did not come from the hub's own pages, so nothing was written.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return no(400, "Expected a JSON body with a name, a dataDir, a port and an agent.");
  }
  const values = readBody(body);
  if (values === null) {
    return no(400, "Expected a JSON body with a name, a dataDir, a port and an agent.");
  }

  // The ledger needs the actor out of the config, so an unreadable config is a
  // refusal rather than a silent unledgered write. See the header.
  try {
    loadConfig();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return no(
      409,
      `Your config has a problem the hub cannot work around, so this form will not write over it: ${detail}`,
    );
  }

  const run = await runThroughLedger("configure", "hub.config.json", false, async () => {
    // turbopackIgnore is not needed here: the write helper takes the hub root as
    // an argument and does its own reads. Nothing path-like is decided in a route.
    const written = writeSetupValues(process.cwd(), values);
    return { ok: written.ok, message: written.message, artifacts: written.ok ? [written.file] : [] };
  });

  if (!run.ok) return no(400, run.message);

  return Response.json({
    ok: true,
    message: run.message,
    // The whole file is read once at startup and the parsed config is cached for
    // the life of the process, so this is a restart, not a refresh. Saying it
    // here as well as on the page means a scripted caller hears it too.
    restartNeeded: true,
  });
}
