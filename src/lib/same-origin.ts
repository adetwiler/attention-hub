// SAME ORIGIN. One check, shared by every route that changes something.
//
// A page on any other site can POST to a loopback port from your browser. The
// hub has no login, so an Origin check is the only thing standing between a
// random tab and a route that mints a shell grant or rewrites your config. A
// page cannot forge this header, which is what makes the check worth anything.
//
// A MISSING Origin IS REFUSED TOO, and that is deliberate: browsers send it on
// every cross-origin POST, so its absence means the caller is not the browser
// these routes exist to serve. Something on your machine that legitimately wants
// to drive the hub has the CLI (scripts/hub.mjs) and the attention feed, neither
// of which comes through here.
//
// This lived inside src/app/api/terminal/session/route.ts until the setup form
// needed the same guarantee. Two copies of a security check is one copy that
// gets fixed and one that does not.

/** True when this request came from the hub's own pages. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    // An Origin that is not a URL is not this hub's.
    return false;
  }
}
