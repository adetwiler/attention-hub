// What the browser pane's address box means by what you typed.
//
// It lives on its own, importing nothing, for one reason: BOTH sides need it.
// The server needs it when a pane is opened (the grant carries a real URL), and
// the client needs it when a live pane navigates without going through the hub.
// Upstream this was two copies with a comment asking whoever changed one to
// remember the other, which is a rule with no mechanism. One module cannot
// drift from itself.

export interface WebTargets {
  /** Where an empty box goes. */
  homeUrl: string;
  /** Where a phrase goes. `{}` is replaced with the url-encoded phrase. */
  searchUrl: string;
}

/** Schemes typed input is allowed to name directly. `javascript:` is absent on
 * purpose: the address box is a place the user types, and a scheme that
 * executes in the page is not something to relay on their behalf. */
const SCHEME = /^(https?|file|chrome|about|view-source):/i;

/** A dotted host with no spaces. "example.com/x" is a URL; "how do i x" is not. */
const BARE_HOST = /^[^\s]+\.[a-z]{2,}(\/|$|\?|#)/i;

/** A typed string becomes a real URL, or a search. */
export function resolveInput(raw: string, targets: WebTargets): string {
  const value = raw.trim();
  if (value.length === 0) return targets.homeUrl;
  if (SCHEME.test(value)) return value;
  if (!/\s/.test(value) && BARE_HOST.test(value)) return `https://${value}`; // hub-no-request: builds a URL string for the user's own browser, sends nothing
  return targets.searchUrl.replace("{}", encodeURIComponent(value));
}
