# Verify walk: slice 1, in a browser, with ledger rows present

- **Date:** 2026-07-29
- **Slice:** 1, the skeleton that runs
- **Version walked:** 0.1.0
- **Platform:** macOS, Node 24.16.0, Next 16.2.12, production mode
- **Instrument:** headless Chromium (Playwright), NOT the Chrome extension. See
  "What could NOT be walked" below.

This is the third and final walk of slice 1, and it exists to close ONE named
gap. The second walk
([2026-07-28-slice-1-review-fixes.md](2026-07-28-slice-1-review-fixes.md)) had
no browser at all, and it said so out loud: the hydration fix was reasoned about
rather than seen, and nobody had ever looked at the console **with ledger rows on
the page**, which is the only state where the relative-time formatter runs. That
is exactly the state a hydration mismatch would show up in, so "reasoned" was not
good enough to close the issue on.

It also caught a real break in the way slice 1 was verified, which is written up
under "Found and fixed" below.

## How to re-run it

```
npm run typecheck
npm run check
npm test
npm run build
npm run release-check
node scripts/serve.mjs start
```

The browser half used a throwaway Playwright script, not committed. Playwright
is not a dependency of this repo and must not become one: the script resolved it
from another checkout on the machine. It navigated to the hub, waited for a
React fiber rather than for network idle, inserted three `action_ledger` rows
straight into SQLite while the page stayed open, watched the DOM change without a
reload, and deleted them again.

## Walked, and what was seen

**1. It hydrated, in a real browser.** `__reactFiber$…` and `__reactProps$…`
were both present on the `.app` root. This is asserted rather than assumed
because the failure it catches (chunks load, React boots, no fiber attaches,
every click dead) renders a page that looks perfectly correct.

**2. TODAY renders honest empty states on a healthy database.** No degraded
card, no invented rows, `0 running / 0 queued`, and BOARD, SESSIONS and JOBS
present in the nav and marked not built.

**3. Ledger rows render live, with no reload.** Three rows were inserted
directly into SQLite with the page open. Within the tick the page read:

```
ATTENTION HUB TODAY BOARD SESSIONS JOBS   1 running / 1 queued
Today                Wednesday 29 July
WAITING FOR YOU      Nothing needs you right now...
JOBS                 deploy: walk-thing    queued
                     build: walk-site      done / just now
                     scan: walk-repo       running
NOT SET UP YET       No AI tool is configured yet...
Attention Hub v0.1.0. Running on this machine only. No telemetry...
```

No navigation happened: the page text before and after differ on a page that was
never reloaded.

**4. The console is clean WITH ROWS PRESENT. This is the line this walk exists
for.** Zero console messages of any kind across load, live insert, three seconds
of settled rendering, and live delete. Zero uncaught page errors. Specifically
zero hydration warnings, which is the evidence that both render passes really do
read `nowMs` off the same snapshot instead of calling `Date.now()` twice. The
second walk could only argue that; now it has been seen.

**5. Deleting the rows returns the honest empty state, live.** Back to
`0 running` with the job rows gone, again with no reload.

**6. The poll fallback matches, fetched from inside the page.**
`GET /api/ledger/stream?once=1` returned `200` carrying exactly `counts`,
`jobs`, `attention`, `degraded`, `nowMs`.

**7. The wire payload is still trimmed.** No `actor`, no `job`, no `pid`, no
`transcript` on any streamed job, checked against real rows rather than against
an empty list. An empty list passes that assertion for free, which is why the
earlier walks were not enough on their own.

**8. Zero external network requests.** Eleven requests over the whole session,
every one of them on `http://127.0.0.1:2886`. This is the mechanical proof
behind the no-telemetry promise, and unlike the first walk it now covers a
session where the app actually had data to render.

**9. Typecheck, config-first check, tests, build and release check are green.**

- `npm run typecheck`: clean.
- `npm run check`: clean, 22 files.
- `npm test`: 52 tests, 52 pass, 0 fail, 0 skipped.
- `npm run build`: compiled, no warnings, three routes, all dynamic.
- `npm run release-check`: clean.

## Found and fixed during this walk

**`npm test` did not run a single test on this machine, and the earlier walks
could not have noticed.** The script was `node --test test/`. A directory
argument works on Node 20 and 22 and is REFUSED on Node 24, where positional
arguments to `--test` became globs: it exits with
`Cannot find module .../test` and the whole suite stops running. Both previous
walks recorded a green `node --test`, because that is the command they ran. They
never ran `npm test`, which is the command the README, `CONTRIBUTING.md`,
`CLAUDE.md` and `test/README.md` all tell a contributor to run.

The lesson is not about Node. **Verify the documented command, not an equivalent
one.** An equivalent command tests your understanding; the documented one tests
what a stranger will actually type.

Two things changed:

- `package.json` now runs bare `node --test`, which resolves the same files on
  Node 20 through 24 and needs no shell glob expansion, so it holds on Windows
  too. Confirmed: 52 tests, 52 pass.
- `release-check.sh` gained a check that fails if the test script ever regains a
  positional path, with the reason written into the failure message. It was
  proved by putting the old value back and watching the check fail, then
  restoring it. Without that guard, an author on Node 22 could reintroduce this
  and see nothing wrong.

## What could NOT be walked, and why

**The Chrome extension was not connected**, so this is headless Chromium again,
not the browser instrument the house rule names. What headless does not cover is
unchanged from the first walk: how it looks on an actual display, and OS-level
notification behaviour. Neither is in slice 1. Everything slice 1 ships (server
render, hydration, an EventSource, a real DOM, a real console) is covered.

**Windows was not walked.** Unchanged from both earlier walks and still true:
CRLF pinning, `start.cmd`, `process.execPath` spawning, `taskkill /T`, and the
CRLF-tolerant denylist loader are built to spec and reasoned about on macOS. The
first Windows run is a real test, not a formality. The test-script fix above is
one more reason to believe that: a break can sit in plain sight in a file
everybody has read, and only show up on a machine that differs.

**`runThroughLedger()` is typechecked and still not exercised.** Nothing in
slice 1 mutates anything, so there is still no caller. Recorded for the third
time rather than quietly dropped. Its first real exercise belongs to the slice
that adds the first verb.

**The update check was not walked because it does not exist.** Slice 6.

**Reaching the hub through a non-loopback hostname was not walked.** Still the
`allowedDevOrigins` path, still not reproducible on loopback, and still mostly
defused by production mode being the default.

**The three npm advisories are unchanged** (`postcss`, `sharp`, both transitive
through Next). See OPEN.md item 5.
