# The browser pane

A pane that holds a real browser, mirrored in over the Chrome DevTools Protocol,
with your clicks and keystrokes forwarded back to it.

Read [ADR-0005](adr/0005-browser-pane-mirrors-a-real-browser.md) for WHY it is
shaped this way (an iframe cannot show most of the web, and the hub can never
drive the browser you have open). This file is HOW it works and, mostly, the
traps. Every trap below was measured, and each one cost real time. None of them
is obvious from the outside, and several look like the tidy answer right up until
you try them.

## Setting it up

```sh
npm run browser:install     # the sidecar's one dependency (ws)
npm run browser             # start the sidecar
node scripts/seed-browser-profile.mjs      # ONCE per profile, that browser QUIT
```

Then declare profiles in `hub.config.json` under `browser.profiles` and set a
pane's kind to `browser`. Every key is documented in
`hub.config.example.json`. Optional: `node deploy/browser/install.mjs` keeps the
sidecar running across a reboot (a LaunchAgent on macOS, a systemd user unit on
Linux, never a system service, because the browser it starts must run as you).

The pane is also reachable on its own at `/browser`, which is where to exercise
it: the traps below only show up against real Chrome, and a full-width pane with
nothing else on the page is the honest place to see them.

## The pieces

| Where | What it owns |
|---|---|
| `chrome/server.mjs` | The sidecar. Launches a browser per profile, mirrors one tab, forwards input. Loopback only. Its own `package.json`. |
| `src/lib/browser.ts` | Hub side: what exists, what is seeded, what is installed, and the single-use token. |
| `src/lib/weburl.ts` | What the address box means by what you typed. Imports nothing, because both sides run it. |
| `src/app/api/browser/route.ts` | The state read the pane opens with. |
| `src/app/api/browser/session/route.ts` | Mints the token. Refuses early, with the fix. |
| `src/app/api/browser/control/route.ts` | Pushes a tiny named action set to open panes. |
| `src/components/WebPane.tsx` | The pane body: the canvas, the toolbar, the input translation. |
| `scripts/seed-browser-profile.mjs` | The one-time profile copy. Refuses while that browser holds the source. |
| `deploy/browser/install.mjs` | Optional service definition, generated at install time. |

## The constraint everything else is built around

**Since Chrome 136, `--remote-debugging-port` is IGNORED when the data directory
is the default one** (`developer.chrome.com/blog/remote-debugging-port`, and
measured as still true on Chrome 150). It is deliberate hardening: remote
debugging can read cookies and passwords, so it may no longer point at the
profile you actually browse with.

So the hub **cannot** drive the browser you have open, ever, and no flag brings
that back. It drives its own copy, seeded once. That single fact explains the
seed script, the per-profile data directories, and why the pane's first-run
message is a command to run rather than a button to press.

## The traps

### Chrome 136 and the default data directory

Above. It is first because every other decision here follows from it.

### One data directory per profile, never one holding several

A browser takes a **singleton lock per user-data-dir**, so a second launch
against the same directory hands off to the first process and exits. Four
profiles in one directory would therefore be ONE browser. Worse, CDP reports no
profile on a target, so nothing downstream could tell which window belonged to
which login. Separate directories make it unambiguous by construction.

The cost is one browser process per profile you actually open, launched on
demand and never before.

### `--window-position` is ignored on macOS

Asking for `-3200,0` at launch produced a window at `0,61`: the OS clamps a new
window onto a display. Parking has to be a `Browser.setWindowBounds` call
**after** the browser is up. macOS honours that, though it still clamps: a
far-negative left lands around `-1400`, leaving roughly a 40px sliver at the
screen edge. That sliver is the honest cost of a browser you can raise.

Verified again in this repo, 2026-07-29: requested `-3200`, got `left -1400`,
`windowState normal`.

### Minimizing is not parking, and it kills the mirror

It reads as the tidy answer. A minimized window stops compositing:

| Window state | Frame rate |
|---|---|
| Parked off-screen | 92.7 fps |
| On screen | 92.3 fps |
| `--headless=new` | 92.6 fps |
| **Minimized** | **0.3 fps** |

Re-measured in this repo against a CSS-animated page, parked, at pane size:
**93.5 fps**. The other three rows are carried over from the upstream
measurement and were not re-run here.

A parked headful window therefore costs nothing against headless, and keeps the
one thing headless cannot give: a window you can pull forward when you need the
browser's own UI. Nothing in this code ever minimizes a window.

Parking also needs three flags at launch, or an off-desktop window is
"occluded" and Chromium throttles rendering to near zero, which presents as a
pane that only updates when you touch it:
`--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`,
`--disable-features=CalculateNativeWinOcclusion`.

### A still page produces NO frames, which looks exactly like a broken stream

A screencast is change-driven. Measured here: `example.com` yielded 3 frames in
3 seconds and an animated page yielded 374 in 4. If you are checking whether the
mirror works, use a page that moves, or you will debug a stream that is fine.

### `rawKeyDown` never submits a form

`rawKeyDown` is explicitly the variant that generates no character, so Enter
typed into a search box does nothing at all. A key with a text equivalent must
be dispatched as `keyDown` **with** `text` (`Enter` carries `\r`, `Tab` carries
`\t`).

Printable input does not go through key events at all: it goes through
`Input.insertText`, which is the only path that gets accents, emoji and IME
composition right. Verified here: `hello wande ä 🐢` arrived intact, and Enter
fired the form's own `submit` event.

On the client side that split is `onBeforeInput` for text and `onKeyDown` for
the named keys only, on a `contentEditable` div (which is what makes a div
receive real text input events) whose caret is hidden (or the typed characters
are also drawn over the picture).

### `startScreencast` immediately after `navigate` fails

`Page.startScreencast` right after a `Page.navigate` returns **"Not attached to
an active page"**, because the navigation briefly detaches the page while it
commits. Stream FIRST, then navigate. That order has a second benefit: the first
frames show the page you are leaving rather than a blank pane while a site
loads.

### Only the ACTIVE tab of a window renders

Screencasting a background tab yields a live socket and a blank white surface,
which is exactly what a restored session of many tabs looks like when the pane
switches onto one of them. `Page.bringToFront` makes it the active tab in its
window. It does NOT raise the window, which stays parked.

### Ack every frame, forward only some

Chrome will not produce the next frame until the current one is acked, so acking
immediately keeps the pipeline alive. Dropping the PAYLOAD when the pane's
socket is already backed up (`bufferedAmount > 2MB`) is what stops a slow link
from building an unbounded queue of stale frames. The result is an adaptive
frame rate rather than a growing delay.

### `targetInfoChanged` fires constantly, and re-rendering closed the tab picker

`Target.targetInfoChanged` fires on every title, favicon and load-state change:
measured at thirteen pushes in seven seconds across four tabs. Every push
re-rendered the pane's `<select>`, and a native dropdown closes when its element
re-renders. So the tab list was correct, the socket was correct, switching worked
when driven directly, and the menu still slammed shut before anyone could click
an option. The fix is a fingerprint of the fields the pane actually renders, and
an unchanged list is never re-sent.

That dedupe has its own trap: it compares against the last list sent to the
PROFILE, so a pane joining a profile whose list has not changed since the
previous pane connected would receive nothing and sit on "(no tabs yet)"
forever. A new socket is therefore answered directly, bypassing the dedupe.

### A debugging port is an identity, so write it down

The port used to be derived (`base + index`). The first time the profile list was
REORDERED, every profile silently repointed: a row labelled one account probed
the port of another, found the browser already running there, and showed its
tabs under the wrong label. That reads as a rendering bug, not a config one.

`browser.profiles[].port` is therefore explicit and required, and the loader
refuses a duplicate.

### Copying a live profile tears it, and "is the browser running" is the wrong question

A profile is a set of live LevelDBs. Copying one out from under a running
browser yields a torn snapshot, and the failure is not a clean error: it is a
browser that looks fine and has quietly lost state.

But refusing whenever *any* process with that name is alive is wrong, and it
blocked a legitimate run upstream when an unrelated headless job had leaked onto
its own throwaway data directory. Chromium answers the real question precisely:
**`SingletonLock` is the lock it takes on a data directory**, a symlink whose
target ends in the owning pid. A live pid means hands off. A stale lock from a
crash is not a reason to refuse, and the seed script says so and continues.

### An inline `<script>` in a top-level `data:` URL does not run

Found while writing the verification walk (Chrome 150): a `data:text/html` page
with a `requestAnimationFrame` loop never animated, so the frame-rate
measurement read 0 fps and looked like a broken stream. Use a CSS animation for
a moving test page. A `data:` URL also may not navigate to a relative form
action: it becomes `about:blank#blocked`, which destroys the page context and
hides whatever you were measuring.

## Honest degradation, which is the other half of the work

Five different things can be wrong, and each has its own sentence and its own
fix. None of them opens a socket, because a pane stuck on "opening..." looks
like progress and is worse than an error.

| State | What the pane says |
|---|---|
| Windows | The pane runs on macOS and Linux, and this machine is not one. |
| `browser.browsers` empty | Nothing is declared to look for. Copy the block from the example config. |
| Declared, none found | Looked at every path and command name and found none. Install one, or add the real path. |
| Profile not seeded | Names the exact seed command, and why the copy exists at all. |
| Sidecar down | Names the port and the command that starts it. |

The install paths live in **exactly one place**, `hub.config.example.json`. A
code default in `src/lib/config.ts` would be a second copy that the sidecar
could never read, because the sidecar boots without TypeScript. That was a real
bug for an hour: the loader defaulted the list, the sidecar defaulted to empty,
and the two then disagreed about whether a browser was installed. Absent means
absent, in both readers.

## What has NOT been verified

- **The Windows path**, beyond the code refusing and saying so. There is no
  Windows machine here.
- **Linux**, at all. The discovery paths and the systemd unit are written from
  the documented locations, not from a run. The PATH fallback exists precisely
  because a hardcoded list is a guess.
- **A non-loopback peer being refused.** The check is set membership on
  `remoteAddress` and there was no second machine to dial it from.
- **Driving the pane's browser from an AI browser extension.** Connecting a
  session to a specific browser is deliberately a human step (the extension makes
  you click Connect), so it needs the owner once per profile.
- **The minimized, on-screen and headless frame rates.** Carried over from the
  upstream measurement; only the parked figure was re-measured here.

The walk that WAS run, and its 14 results:
[docs/verification/2026-07-29-slice-13-browser-pane.md](verification/2026-07-29-slice-13-browser-pane.md).
