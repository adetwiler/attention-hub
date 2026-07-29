# How the pieces fit

Lazy-loaded topic doc. Read it when you are about to change the spine, or when
you need to know where your slice plugs in. The WHY lives in
[ADR-0002](../adr/0002-hub-architecture.md); this is the HOW.

## The spine, bottom up

```
hub.config.json ─────► src/lib/config.ts   the registry: what exists
                            │
                            ▼
                       src/lib/db.ts       SQLite connection + the ledger queries
                            │              (schema and migrations: src/lib/migrate.ts)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    src/lib/ledger.ts            src/lib/stream.ts
    every mutation               the one snapshot every surface renders
                                          │
                            ┌─────────────┴──────────────┐
                            ▼                            ▼
              src/lib/sse.ts                    layout.tsx / page.tsx
              the stream route helper           server-side first paint
                            │                            │
                            ▼                            ▼
              /api/ledger/stream          src/components/useEventStream.ts
                                          one EventSource per page
```

## Each file, and the one thing it guarantees

**`src/lib/config.ts`** guarantees that no path or port is written in code.
Defaults-first constants at the top, hand-written parsers (no schema library),
`~` expanded at load time, every error naming its exact key. A missing section
is never an error. The parsed result is cached for the process lifetime, so a
config edit needs a restart, and the setup docs say so out loud.

**`src/lib/db.ts`** guarantees one history and one connection. `getDb()` is the
only place a connection is opened, and the handle lives on `globalThis` so a dev
module reload reuses it instead of leaking a second one against the same file.
The read queries name their columns explicitly (`VIEW_COLUMNS`) so the job spec
and the pid are never even loaded, and `readConsistently()` wraps the snapshot's
two reads in one transaction so the counts and the rows describe one instant.

**`src/lib/migrate.ts`** guarantees one schema evolution path. The `MIGRATIONS`
array index IS the version; each migration runs inside the same transaction that
bumps `user_version`, so a crash mid-migration leaves the database at the
previous version. Foreign keys go OFF around the whole loop (a `PRAGMA` inside a
transaction does nothing, which would have made the prescribed table-rebuild
impossible) and a `foreign_key_check` afterwards turns a rebuild that orphans a
reference into a loud failure instead of a shipped broken database. It imports
only a TYPE, which is what lets `test/migrations.test.mjs` load it without
booting the app.

**`src/lib/ledger.ts`** guarantees that a mutation cannot happen invisibly.
`runThroughLedger(verb, target, undoable, fn)` inserts running, executes,
settles. A throw inside `fn` becomes a failed row with the message on it.

**`src/lib/stream.ts`** guarantees one snapshot shape, and that the wire format
is a TRIM of the row rather than the row: `job`, `pid` and `actor` are not
selected at all, because the job spec can carry argv, env and credential
references. `JOBS_STREAMED` bounds the payload so it does not grow without limit
over months. It also guarantees that BROKEN IS NOT EMPTY: `safeLedgerSnapshot()`
never throws, but a database it cannot read comes back with `degraded` set and
logged once, never as a convincing empty hub.

**`src/lib/sse.ts`** guarantees the poll-fallback contract: `?once=1` returns
the identical snapshot as plain JSON, because ONE `snapshot()` function feeds
both branches. Unchanged snapshots emit nothing; a forced emit every
`forceEvery` ticks keeps the pipe warm and advances client clocks in one
mechanism, which is why there is no separate keepalive. It also guarantees ticks
never overlap: the loop is a chained `setTimeout`, not `setInterval`, so an async
snapshot cannot stack work or emit an older payload after a newer one.

**`scripts/next-run.mjs`** guarantees that Next.js is never launched with its
telemetry on, because it is the only file allowed to launch it, and that killing
the launcher does not orphan the server holding the port and the database.

**`src/components/useEventStream.ts`** guarantees one EventSource per page no
matter how many components subscribe, and that stream health is observed rather
than guessed: an error turns polling on, the next event turns it off.

## Where the later slices plug in

| Slice | Plugs into | Notes |
|---|---|---|
| 2, attention queue | `LedgerSnapshot.attention` | The array and the `AttentionItem` type already ride the stream, so the client contract does not move. Fill the producer, render items in `AttentionCard`. |
| 3, jobs and the supervisor | `action_ledger.job` / `pid` / `transcript` | Columns already exist in migration 0. The child process writes files; only the web process touches SQLite. |
| 4, board | a new room + its own snapshot | Reuse `sseResponse` and `makeStreamHook`; do not hand-roll a second stream helper. |
| 5, self-build | `runThroughLedger` + `HUB_DIST_DIR` | Building the hub inside the hub needs the scratch dist (`npm run build:check`), or the build kills the instance serving the page you are watching. |
| 6, updates | `config.update` | The one allowed network call, and it is NOT built: the README, `CONTEXT.md` and the config `$comment` all say so, and all three have to change in the same pass that builds it. Mark the call `hub-allow-network:` or the hook blocks it. |
| 7, markdown modules | `config.modules` + `userDir` | `marked` is already a dependency for this. |
| 8, release copy | `Shell.tsx` footer, README | The attribution seam is already in the footer; fill the text and the link. |
| 9, quad view | `config` panes | Panes are config-driven; the grid adapts to the configured count. |

## Traps this codebase has already paid for

**A native module in instrumentation is a total outage.** A top-level import of
`better-sqlite3`, or of anything that imports it, inside `src/instrumentation.ts`
drags the native addon into the edge instrumentation bundle, which cannot
resolve it, and every route 500s. The `process.env.NEXT_RUNTIME === "nodejs"`
guard only helps if the `await import(...)` is INSIDE it. There is no
instrumentation file yet; when one lands, this is the rule.

**`serverExternalPackages: ["better-sqlite3"]` is not optional.** Without it the
native module is bundled into the server build and the app fails at runtime.

**`next build` and `next dev` share `.next`.** Building in the checkout that is
serving you takes it down mid-page. `npm run build:check` points at
`.next-check`. This matters most for self-build.

**Any bare `next` invocation phones Vercel.** `"build": "next build"` shipped in
the first draft while four other entry points set `NEXT_TELEMETRY_DISABLED`
correctly, and it was the one command the README told users to run. Everything
goes through `scripts/next-run.mjs`, and `.githooks/release-check.sh` fails if a
`package.json` script does not.

**Runtime `path.join(process.cwd(), ...)` traces the whole project.** Turbopack
warns "Encountered unexpected file in NFT list" and treats every file in the
repo as a dependency of the route. The fix is the exact marker
`path.join(/*turbopackIgnore: true*/ process.cwd(), x)`, with no spaces inside
the comment. It is applied in `config.ts`, `version.ts` and `next.config.ts`.

**Next dev blocks cross-origin dev resources.** Reach the hub through any
hostname other than the bind address and the page renders while every click is
dead, because React boots but no fiber attaches. Loopback never reproduces it.
`allowedDevOrigins` comes from `bind.allowedDevOrigins` in config.

**An open EventSource means `networkidle` never fires.** Any browser automation
that waits for network idle on a hub page will hang until it times out. Wait for
`domcontentloaded` plus a hydration beat instead. Cost us a verify-walk run on
2026-07-28.

**Volatile fields defeat SSE diffing.** A snapshot carrying a clock or an
elapsed count "changes" every tick and nothing is ever suppressed. That is what
`diffKey` is for: zero the volatile field before comparing.

**An SSE comment keepalive is invisible to `EventSource`.** `: keepalive` cannot
serve as a client health signal. Use the forced periodic named emit.

**Windows: `spawn(node_modules/.bin/next)` fails.** The bin entry is `next.cmd`,
and reaching for `shell: true` to fix it opens a shell-injection surface. Spawn
`process.execPath` against the resolved Next JS entry instead, which is what
`scripts/next-run.mjs` does.

**A relative time computed in a client component is a hydration mismatch.** The
component renders on the server too, so `Date.now()` runs twice against two
clocks and a row near a bucket boundary says "just now" then "1m ago". The
snapshot carries `nowMs`; pass it to `relTime`. It is invisible while the ledger
is empty, which is exactly why it would have surfaced later as a mystery.

**`PRAGMA foreign_keys` does nothing inside a transaction.** So does
`defer_foreign_keys`. Both verified against the installed `better-sqlite3`. The
table-rebuild dance the schema comment prescribes needs foreign keys off OUTSIDE
the transaction, which is why `runMigrations` owns the loop.

**nginx buffers `text/event-stream` by default.** A user who follows the
reach-it-from-anywhere advice with a proxy in front sees a page that renders and
then updates only via the 5s poll, or not at all. `sseResponse` sets
`x-accel-buffering: no`.
