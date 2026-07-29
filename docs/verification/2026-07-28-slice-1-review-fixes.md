# Verify walk: slice 1, after the review pass

- **Date:** 2026-07-28
- **Slice:** 1, the skeleton that runs
- **Version walked:** 0.1.0
- **Platform:** macOS, Node 24.16.0, Next 16.2.12
- **Instrument:** the running server plus `curl`, `node --test`, and the shell
  gates driven against real commits. NOT a browser. See "What could NOT be
  walked" below, which is the section that matters.

This is the second walk of slice 1. The first
([2026-07-28-slice-1.md](2026-07-28-slice-1.md)) verified the skeleton; three
review axes then found 27 findings across it, and this walk verifies the fixes.
Same rule as before: what was walked, what was seen, then what was NOT covered.

## How to re-run it

```
cp hub.config.example.json hub.config.json
npm install
npm run typecheck
npm run check
npm test
npm run build
node scripts/serve.mjs start
# then, in another shell
curl -s http://127.0.0.1:2886/
curl -s "http://127.0.0.1:2886/api/ledger/stream?once=1"
```

## Walked, and what was seen

**1. The telemetry claim is now true on the documented path.** This is the
headline fix and it was proved directly rather than argued.

```
$ npx next telemetry status          # this machine, outside the hub
Status: Enabled

$ node -e 'import("./scripts/next-run.mjs").then(m => m.runNext(["telemetry","status"]))'
Status: Disabled
```

Machine-level telemetry is genuinely on, and every command that goes through the
hub's boot path sees it off. `npm run build` is `node scripts/build.mjs`, which
calls `runNext`, so the command the README prints no longer phones Vercel. The
release check now FAILS if any `package.json` script invokes `next` directly:
proved by temporarily restoring `"build": "next build"` and watching it fail
with `package.json scripts invoke next directly, bypassing the telemetry switch`.

**2. Production mode starts from cold, in one command.** With `.next` and `data`
both deleted:

```
[hub] start on http://127.0.0.1:2886
[hub] Local only: nothing else on your network can reach this.
[hub] No production build yet, building it once (this takes a minute)...
... Compiled successfully ...
```

Then `GET /` returned `200` and `data/hub.db`, `-wal` and `-shm` appeared. So
the default run mode (now production, not dev) works end to end from a fresh
clone state with no separate build step.

**3. Dev mode still works and says what it is.**

```
[hub] dev on http://127.0.0.1:2886
[hub] Development mode: slower, and it watches your files. Plain ./start.sh runs production.
```

`GET /` returned `200`.

**4. TODAY renders with honest empty states.** Extracted visible text from the
served HTML in production mode, fresh database:

```
ATTENTION HUB / TODAY / BOARD / SESSIONS / JOBS / 0 running / 0 queued
Today                Tuesday 28 July
Waiting for you      Nothing needs you right now...
Jobs                 No jobs yet...
Not set up yet       No AI tool is configured yet...
Attention Hub v0.1.0. Running on this machine only. No telemetry...
```

No sample rows. No degraded card (correct: the database is healthy).

**5. Real ledger rows render, and the counts are live.** Two rows inserted
straight into SQLite while the server ran:

```
1 running / 0 queued
scan: my-site      running
build: docs-site   done / just now
```

**6. The wire payload is still trimmed, now structurally.** The `?once=1`
payload carried `id, verb, target, state, note, artifacts, route, created_at,
started_at, ended_at` and nothing else. No `actor`, no `job`, no `pid`, because
the SELECT no longer asks for them rather than a mapping step dropping them
afterwards.

**7. BROKEN IS NOT EMPTY, verified by breaking it.** Pointed `dataDir` at a
`chmod 500` folder and restarted. The page rendered:

```
Database problem
The hub cannot read its own database, so nothing below is real. Check that the
dataDir in your config exists and is writable. The error was: EACCES: permission
denied, mkdir '/tmp/hub-ro/data'
```

and the server log carried the same line once, not once per 1.5s tick. Before
this fix that install rendered identically to a healthy fresh one.

**8. The boot script refuses a value it cannot use instead of substituting one.**

```
$ # bind.port set to the string "3000"
[hub] hub.config.json: expected a whole number at "bind.port"
[hub] Fix that key, or remove it to fall back to the documented default.
EXIT=1
```

Note what is absent: it did not print an address. Before, it announced and bound
2886 while the app's own loader threw on the same file, so the user browsed to
3000 and found nothing, with no error anywhere.

**9. The poll-fallback contract holds, and diff suppression survived the new
clock field.** `?once=1` returned the identical JSON shape to the stream. A
30-second raw `curl -N` received exactly 2 frames: the initial one and the
forced keepalive at tick 16 (24s). That is the proof that `diffKey` correctly
excludes the snapshot's `nowMs`, which otherwise would have made every tick look
like a change and silently deleted the emit-only-on-change property.

**10. `x-accel-buffering: no` is on the stream response.**

```
content-type: text/event-stream
cache-control: no-cache, no-transform
connection: keep-alive
x-accel-buffering: no
```

**11. Killing the launcher by pid frees the port.** `kill -TERM` on the
`serve.mjs` process, then `lsof -ti :2886` returned nothing. Before the signal
forwarding, the next-server grandchild survived holding the port and the
database, and the next start failed with an unexplainable EADDRINUSE.

**12. No external network requests, proved from the served bytes.** Fetched the
page and every client chunk it references and grepped for non-loopback hosts.
The only external strings are documentation links inside error messages
(`nextjs.org`, `react.dev`), an upstream licence URL in a `core-js` banner, and
the SVG XML namespace (`w3.org`). None is fetched. The only `fetch` calls in the
bundle are Next's own same-origin router calls and the hub's `?once=1` poll.

**13. Typecheck, lint, tests and build are green.**

- `npx tsc --noEmit`: clean.
- `node scripts/check-paths.mjs`: clean, 22 files.
- `node --test`: 52 tests, 52 pass, 0 fail, 0 skipped.
- `npm run build`: compiled, no warnings, three routes, all dynamic.
- `bash .githooks/release-check.sh`: clean.

## The gates were tested by attacking them, not by reading them

Each of these was run against the real repo with a real `git commit`. Every one
was rejected and HEAD never moved.

| Attack | Before | After |
|---|---|---|
| A malformed regex in `denylist.local` (`Acme (Holdings`) | grep exits 2, `\|\| true` swallows it, EVERY term stops being checked, commit passes silently | `REFUSED: ... is not a valid extended regex`, and it NAMES the bad line |
| `denylist.local` saved with CRLF | every term gets a trailing `\r`, matches nothing, non-empty check still passes | carriage returns stripped on read; proved a CRLF list still catches a real term from it |
| The unedited example copied by `install.sh` | passes the non-empty check while protecting nothing | `REFUSED: ... is still the unedited example` |
| A real home path AND a real email in `docs/leaktest.md` | committed clean (the personal-data rule only ran at release time, and only over `src/`) | BLOCKED three times over: denylist, home path, email address |
| A tracked binary carrying `/Users/<me>/private` and a private product name | invisible to `grep -I` and to `git diff`; the audit printed "clean" | BLOCKED, and the audit now prints how many binary files it scanned |
| `execSync("curl ...")`, `new WebSocket`, `undici`, `node:net`, an image beacon under `src/` | all committed clean (the gate listed names, not reach) | all BLOCKED; the gate now blocks any non-loopback URL, any network-capable import, and any curl or wget |
| The real slice, staged in full | n/a | PASSED, so the gates are not blocking legitimate work |

Two of the repo's own lines were caught by the tightened network gate and now
carry honest markers: the `EventSource` in `useEventStream.ts`
(`hub-allow-network:`, it really does connect, same origin) and the address
`serve.mjs` prints (`hub-no-request:`, it only contains a URL).

`node scripts/check-paths.mjs` also used to green over its own counterexample:
its port rule could not match `DEFAULT_PORT = 2886` or `BIND_PORT_DEFAULT = 2886`
because `_` is a word character. It now catches both, they carry the
`check-paths-allow:` marker, and `release-check.sh` asserts they agree with
`hub.config.example.json` (proved by setting one to 2887 and watching it fail).

## The regression net, and the two tests worth naming

`npm test` is `node --test`. Zero dependencies: `node:test` is part of the Node
20 the `engines` field already requires. 52 tests over migrations, config
parsing, the boot script's verdict on the same files, and time formatting.

Two of them exist because the review found real traps:

- **"the prescribed rebuild works with a child table referencing the ledger."**
  `PRAGMA foreign_keys` is a no-op inside a transaction, so the create-new /
  INSERT-SELECT / DROP / RENAME dance that `db.ts` tells the next author to
  perform would have died with `FOREIGN KEY constraint failed` the moment a
  second table referenced `action_ledger`. `defer_foreign_keys` does not rescue
  it either. Both verified empirically against the installed `better-sqlite3`.
  The runner now turns foreign keys off around the whole loop.
- **"a rebuild that orphans a reference fails loudly instead of shipping."**
  The other half: with foreign keys off, a careless rebuild silently produces a
  broken database. `PRAGMA foreign_key_check` after the loop turns that into an
  exception.

## What could NOT be walked, and why

> **The browser gap below is now closed.** See
> [2026-07-29-slice-1-browser-walk.md](2026-07-29-slice-1-browser-walk.md),
> which walked it with ledger rows present and a clean console, and which found
> that `npm test` had stopped running any tests at all on Node 24.

**No browser.** The Chrome extension was not connected during this walk, and
unlike the first walk there was no Playwright run either. So hydration was NOT
observed in a real browser this time. What that leaves unverified:

- The hydration fix itself. The relative-time mismatch is now structurally
  impossible (both passes read `nowMs` off the same snapshot object rather than
  calling `Date.now()` twice), and the first walk confirmed fiber attachment on
  essentially the same shell, but "reasoned" is not "seen". **Re-walk in Chrome
  before this is handed to a real user**, and specifically check the console
  with ledger rows present, which is the state the first walk could not reach.
- Console cleanliness during a live update.
- How it looks on an actual display.

**Windows was not walked.** Everything Windows-specific in this slice (CRLF
pinning, `start.cmd`, spawning `process.execPath`, `taskkill /T` on the signal
path, the CRLF-tolerant denylist loader) is built to spec and reasoned about on
macOS. The CRLF denylist fix was proved with a synthetic CRLF file, which is the
mechanism but not the platform. First Windows run is a real test.

**The update check was not walked because it does not exist.** The README,
`CONTEXT.md` and the config `$comment` now all say so in as many words, which
was itself one of the findings: they previously described it in the present
tense as shipped.

**`runThroughLedger()` is typechecked but still not exercised.** Nothing in
slice 1 mutates anything. Unchanged from the first walk, recorded again rather
than quietly dropped.

**Reaching the hub through a non-loopback hostname was not walked.** Still the
`allowedDevOrigins` path, still not reproducible on loopback. Worth noting that
flipping the default to production mode removes this failure mode for ordinary
users, since the cross-origin dev block exists only in dev.

**The three npm advisories are unchanged** (`postcss`, `sharp`, both transitive
through Next). See OPEN.md item 5.
