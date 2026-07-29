# 2026-07-29: the first run of the integrated hub, and the stale-build defect it found

Three slices had merged to `main` (9 pane grid, 2 attention feed, 13 browser pane),
every gate was green, and **nobody had actually run the result.** This is that run.
It found a release-blocking defect that no gate could have caught, because the
gates build and the defect is in what `start` chooses to serve.

## What was walked

`npm start` on `main` at `4ac6263`, then plain HTTP requests. No browser
extension involved: this is the layer a machine can check, and it is deliberately
NOT the Chrome walk, which still needs a human to connect the browser.

## THE DEFECT: `start` served a 13-hour-old build, and two rooms 404ed

| Path | First run | After a real `npm run build` |
|---|---|---|
| `/` | 200 | 200 |
| `/wall` | **404** | 200 |
| `/browser` | **404** | 200 |

`scripts/serve.mjs` rebuilt only when `.next/BUILD_ID` was **absent**. The build
was from 03:57, `HEAD` was from 17:00, so the check passed and the server happily
served the old app. `build:check` had listed `/wall` and `/browser` minutes
earlier, because it builds to a scratch directory on purpose so it does not
disturb a running hub. Every gate was honest. The running app was not the built
app.

**Why this was release-blocking rather than a papercut.** Two decisions collide:
production is the default run mode (ADR-0002 decision 8), and **v1 updates are
plain `git pull`** (owner decision, 2026-07-29). So the shipped update path was:
pull a release, restart, and be served the OLD hub indefinitely, with every new
room returning 404 while the docs said it was there. A stranger would conclude
the release was broken, and they would be right, just not about the part they
could see. That is BROKEN IS NOT EMPTY at the deployment level.

## The fix, and both directions of it were tested

`start` now compares `.next/BUILD_ID`'s mtime against the newest mtime under
`src/`, plus `package.json`, `next.config.ts` and `tsconfig.json`, and rebuilds
when the source is newer. It says which case it is in rather than pausing
silently.

- **Stale source rebuilds.** `touch src/app/page.tsx`, then `npm start`:
  `The code is newer than the last build, so this one is stale.` /
  `Rebuilding before serving, or you would get the old hub back.` Then ready, and
  all three rooms 200.
- **A runtime-config change does NOT rebuild.** `touch hub.config.json`, then
  `npm start`: no rebuild notice, ready in 60ms, all three rooms 200.

That second case is the one worth guarding. `hub.config.json` is read at request
time, so making it a rebuild trigger would turn every settings tweak into a
minute-long pause and teach users that editing config is expensive. It is
excluded on purpose, not by omission.

## The snapshot contract holds

`/api/ledger/stream?once=1` returned 200 with
`attention, counts, degraded, jobs, nowMs`. The server clock (`nowMs`) is present,
which is what client components format relative times against so the server and
hydration passes cannot disagree, and `degraded` is present and null rather than
missing.

## Not verified here, and it needs a human

Everything in-browser: a toast visibly appearing, the pane grid under a real
pointer, focus and fullscreen keys, the browser pane's picture, seeding a real
browser profile, and the extension Connect handshake. Those are #8's release walk.

## No test was added, and that is stated rather than hidden

The staleness logic lives in a dependency-free script whose only honest test
drives a real build, which takes minutes. `test/serve-config.test.mjs` already
runs the script as a process for config parsing, so the hook exists if this is
ever worth the wall-clock. For now the check above is manual and recorded here,
which is the same standard the rest of this directory holds.
