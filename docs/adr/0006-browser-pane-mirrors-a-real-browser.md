# ADR-0006: The browser pane mirrors a real browser instead of framing a page

- **Status:** accepted
- **Date:** 2026-07-29
- **Slice:** 13 (the browser pane)

## Context

The wall is one screen holding everything you are working across, and one of
those things is the web. The obvious implementation is an `<iframe>`: no extra
process, no protocol, twenty lines.

It cannot work, and the reason is not a bug anyone can fix. `X-Frame-Options`
and `frame-ancestors` are the SITE's headers, and no browser is permitted to
override them. Measured 2026-07-29 against seven search engines: Google,
DuckDuckGo, Brave, Startpage, Ecosia and Mojeek all refuse to be framed.
Exactly one, Bing, could be. Most of the interesting web behaves the same way.

A pane that can only ever show the small half of the web is not a browser, and
no amount of work on the iframe changes which half.

## Decision

**The pane shows a picture of a real browser tab, and forwards input back to
it.** A loopback sidecar (`chrome/server.mjs`) speaks the Chrome DevTools
Protocol: `Page.startScreencast` out, `Input.*` in. The pane paints JPEG frames
onto a canvas and sends mouse and keyboard events in page coordinates.

A screencast frames nothing, so the entire class of failure disappears. The
site sees an ordinary browser because it IS one. Three things follow that an
iframe could never have offered:

- Every site works, including the ones that refuse framing.
- The browser keeps its own cookies and logins, persistently, because it is a
  real profile and not a scratch context.
- An AI browser extension living in that browser can drive the exact page you
  are looking at.

**It is a separate process, not a route.** A Next route handler cannot perform
a WebSocket upgrade, and `scripts/serve.mjs` spawns the `next` CLI as a child,
so there is no in-process server object to attach an `upgrade` listener to. The
sidecar keeps its own `package.json` for a second reason: `next build` traces
anything in the app's dependencies, and a WebSocket server has no business in a
browser bundle.

**The hub can never drive the browser you have open.** Since Chrome 136,
`--remote-debugging-port` is ignored when the data directory is the default one.
That is deliberate hardening, because remote debugging can read cookies and
passwords, and it is measured as still true on Chrome 150. So the hub drives its
own copy of a profile, made once by `scripts/seed-browser-profile.mjs`. This is
not a workaround to be removed later: it is the shape of the feature.

## How this squares with NO TELEMETRY

This is the question worth answering out loud, because the product's headline
promise is that it makes no network calls, and this slice adds a component whose
whole job involves the network.

**The hub still sends nothing.** Everything the sidecar itself opens is
loopback: the debugging port of a browser on this machine, and the pane's own
socket. Every such line carries an explicit `hub-allow-network:` marker naming
why, and `chrome/` was added to the pre-commit network gate's scope in the same
commit, because leaving a network-capable directory outside the gate that backs
this claim would have been worse than having no gate.

**The browser makes the requests you tell it to, as browsers do.** Typing an
address into the pane loads that page, exactly as it would in any browser
window. That is the user acting, not the product reporting. Nothing about it is
recorded: see below.

**No browsing history, anywhere.** The ledger records that a pane was opened on
a profile. Not the URL beyond the one that was asked for, not a title, not a
tab list, not a duration. There is deliberately no table for it. A browsing log
would be the single most sensitive file this product could keep, and nobody
asked it to keep one.

## Security shape, matching the terminal sidecar

A signed-in browser holds live sessions for every account you own, so this is
not deferred to a later slice.

1. **Loopback only.** The sidecar refuses a non-loopback peer itself, whatever
   is in front of it, and its listen host is not configurable. A config key for
   it would be a way to break this by accident.
2. **Single-use token, and the grant is in the row.** The hub mints a 60-second
   row in its own database; the sidecar burns it on connect. WHICH PROFILE lives
   in that row, never in the URL, so a token that leaks out of a log or an
   address bar cannot be re-pointed at a different profile's browser.
3. **Idle drop.** A silent socket closes. The browser keeps running, which is
   the point.
4. **No kill path.** The sidecar can start and attach. It can never quit a
   browser or close a tab, so a browser the hub opened behaves like a terminal
   session you can always reach by hand.
5. **Fail-closed suppression seam.** `WebPane`'s `suppressed` prop makes the
   pane refuse to render live rather than masking pixels over it, for a host
   that has a record or privacy mode. The hub does not have one yet, and the
   seam is here rather than later because retrofitting it means auditing a live
   surface.

## Consequences

- **The browser is headful and parked off-screen, never headless and never
  minimized.** Measured: parked 92.7 fps, on screen 92.3, headless 92.6,
  minimized 0.3. Headful therefore costs nothing and keeps a window you can pull
  forward, which you need because an extension popup, a download prompt and a
  file picker are the browser's own UI and never appear in a screencast of page
  pixels. Minimizing looks like the tidy answer and kills the mirror.
- **One data directory per profile.** A browser takes a singleton lock per data
  directory, so several profiles in one collapse into a single browser, and the
  protocol reports no profile on a target, leaving nothing able to tell which
  window belongs to which login.
- **A one-time seed step is part of the feature**, not a rough edge. It is the
  direct consequence of the Chrome 136 change, and the pane names the exact
  command when a profile has not been seeded.
- **macOS and Linux.** Windows is not supported, and every surface says which
  rather than hanging: `/health` reports it, the state route reports it, and the
  pane prints it.
- **Anything the sidecar cannot answer, the pane must be able to say.** Five
  distinct failures have five distinct sentences (unsupported platform, no
  browser declared, no browser found, profile not seeded, sidecar down) and none
  of them opens a socket. A pane stuck on "opening..." looks like progress,
  which is worse than an error.

## Alternatives rejected

**An iframe.** Cannot show most of the web, for a reason no client can change.
This is what it replaced.

**Headless Chrome.** Identical frame rate, and it gives up the one thing the
parked window is for: a window you can raise when you need the browser's own UI.

**Embedding a browser engine (CEF, WebView).** A large native dependency, a
build step per platform, and it still would not be the browser your extension
and your logins live in.

**Puppeteer or Playwright in the sidecar.** A much larger dependency to use
three CDP domains and a socket, in a repo whose dependency list is a stated
feature.

## Related

- [docs/browser-pane.md](../browser-pane.md): how it works and every measured
  trap, which is the file to read before changing any of it.
- [ADR-0002](0002-hub-architecture.md): no telemetry, config first, one history.
- [ADR-0004](0004-pane-content-contract.md): why this is a pane BODY and owns no
  layout, focus or error frame.
