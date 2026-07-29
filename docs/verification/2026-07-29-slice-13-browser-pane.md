# Verification walk: slice 13, the browser pane

- **Date:** 2026-07-29
- **Machine:** macOS (darwin), Chrome 150.0.7871.187, Node 24.16.0
- **Profile used:** a SCRATCH profile in a temporary data directory, never a real
  one. Chrome and the sidecar were both stopped and the directory deleted
  afterwards.

## What was driven

A script spoke to the sidecar exactly as `WebPane` does: it minted a token into
the hub database, opened `ws://127.0.0.1:<port>/cdp?token=...`, and then sent the
same wire messages the component sends (`resize`, `navigate`, `mouse`, `text`,
`key`). Where an assertion needed the truth from inside the page, it read it
through a second, independent CDP connection rather than through the thing under
test.

## Results: 14 of 14

| # | Assertion | Result |
|---|---|---|
| 1 | A bogus token is refused, with close code 4001 | PASS |
| 2 | A minted token reaches `ready`, reporting the profile and its label | PASS (profile `scratch`) |
| 3 | The token is BURNED: zero rows left after connect | PASS |
| 4 | Frames arrive | PASS (first at 71ms) |
| 5 | The pane is told where it is | PASS |
| 6 | It navigated to the URL carried in the GRANT, not one in the socket URL | PASS |
| 7 | The tab list is published | PASS |
| 8 | The window is PARKED off-screen | PASS (asked `-3200`, got `left -1400`) |
| 9 | The window is NOT minimized | PASS (`windowState normal`) |
| 10 | Printable text arrives through `Input.insertText` | PASS (field read back exactly) |
| 11 | Accents and an emoji survive it | PASS (`hello wande ä 🐢`) |
| 12 | Enter SUBMITS a form, so it is `keyDown` WITH text and not `rawKeyDown` | PASS (the form's own `submit` event fired) |
| 13 | Tab reaches the page as a real key | PASS (`keyCode 9`) |
| 14 | The browser SURVIVES the pane closing (no kill path) | PASS |

Two more, run separately:

- **Parked frame rate, against a moving page:** 93.5 fps (374 frames in 4.0s) at
  pane size, window parked at `-1400`. This is the measurement the whole
  parked-not-minimized decision rests on, so it was re-run here rather than
  inherited.
- **Honest degradation with no browser installed:** the config was pointed at a
  bogus binary path and a bogus command name, and `/health` answered
  `browser: false, browsers: {chrome: false}` with the sidecar logging
  `chrome:MISSING`. It did not hang and it did not claim a browser.

## Two real bugs this walk found

**A split verdict on whether a browser is installed.** The TypeScript loader
defaulted `browser.browsers` from a code constant while the sidecar defaulted it
to an empty map, so with a config that omitted the key the hub said a browser was
present and the sidecar said it was not. The sidecar boots without TypeScript, so
keeping the two constants in step was never possible. Fixed by having exactly one
copy of the install paths, in `hub.config.example.json`, which both readers
already fall back to. Absent now means absent in both.

**The wall would have overridden the pane's own profile picker** on every reload,
because the registry adapter passes the pane id as the profile and the component
preferred the prop over the remembered choice. A pane the user had pointed at
another browser silently snapped back. The remembered choice now wins and the
prop is the first-time default.

Both are recorded because a walk that only confirms what you expected has not
earned its time.

## What was NOT verified, and why

- **Windows:** no machine. The code refuses and names the platform; that path was
  read, not run.
- **Linux:** no machine. The discovery paths and the systemd unit come from the
  documented locations. The PATH fallback exists because a fixed list is a guess.
- **A non-loopback peer being refused:** the check is set membership on
  `remoteAddress`, and there was no second machine to dial from.
- **Seeding a REAL profile:** the walk used an empty scratch data directory, so
  the copy path (`cpSync` with its filter, the `Local State` retarget, the
  extension count) was exercised only against a config with no browser data, where
  it correctly reported what it could not find. Copying a real signed-in profile
  needs the owner, since it reads their browser and refuses while it is open.
- **Driving the pane's browser from an AI browser extension:** connecting a
  session to a specific browser is deliberately a human step (the extension makes
  you click Connect in it), so the end-to-end "ask a session to drive the pane"
  story needs the owner once per profile. FOLLOW, the tab picker and the
  window-parking that story depends on were all verified; the human handshake was
  not.
- **The pane rendered in a real browser.** The wire protocol, the token handshake,
  the window parking and the input round trip were driven headlessly against real
  Chrome. `WebPane` itself was typechecked and built, not clicked.
