# Attention Hub: operating manual

Read this first, every session. It is short on purpose. To locate anything else,
read [docs/context-map.md](docs/context-map.md) and open only the one file you
need.

Start here: [CONTEXT.md](CONTEXT.md) for the vocabulary, [OPEN.md](OPEN.md) for
what is undecided.

## What this is

A free, local-only command center for AI-assisted work. It runs on the user's
own machine, against their own AI tool and their own database. It is a giveaway:
the repo is public, and the code is the product's least valuable part. The moat
is the update channel, the memory network, the modules, and the author.

## The rules that are not negotiable

**NO TELEMETRY, EVER.** The hub holds none of the user's data, and **this release
makes ZERO outbound calls. Full stop, no exception.** The GitHub Releases check
is post-v1, so the honest v1 claim is stronger than "one call", and it is the
product's single strongest asset: an opt-in email digest was built in slice 8 and
CUT for exactly that reason (owner, 2026-07-29). Every marked network line in the
tree is loopback. **If you are about to add the first non-loopback one, that is a
decision for the owner and an ADR, not a commit.**

Two mechanisms hold this, and both exist because a promise in a README is worth
nothing:

- `scripts/next-run.mjs` is the ONE place Next.js is launched from, because that
  is where `NEXT_TELEMETRY_DISABLED` is set. Never spawn `next` anywhere else.
  The release check fails if a `package.json` script does.
- The pre-commit hook blocks REACH, not a list of names: any non-loopback URL,
  any network-capable module import, any curl or wget under `src/` or
  `scripts/`, unless the line carries `hub-allow-network:` (it really does
  connect) or `hub-no-request:` (it only mentions a URL) plus a reason.

If you are about to add analytics, error reporting, a font CDN, or a "just this
once" ping, the answer is no.

**PUBLIC REPO.** Nothing personal, no client names, no absolute home paths, no
keys. The gates are mechanical (see below) but they are a backstop, not a
licence to be careless. A gate that cannot run REFUSES: read the header of
`.githooks/gate-lib.sh` before touching any of them.

**BROKEN IS NOT EMPTY.** Honest empty states are a rule, and so is their other
half. A surface that cannot read its data says so (`LedgerSnapshot.degraded`).
Never swallow an error into a plausible-looking zero.

**NO EM DASHES.** Anywhere: code, comments, docs, commit messages. Use a
period, a comma, a colon, or parentheses. The hook blocks it.

**CONFIG FIRST.** Every path and every port comes from `hub.config.json`
through `src/lib/config.ts`. Zero absolute paths in `src/`, enforced by
`node scripts/check-paths.mjs`.

**LOCAL BY DEFAULT.** The bind host ships as loopback. Nothing here shells out
to another tool to find a network address, and nothing ever falls open to
`0.0.0.0`.

**TYPESCRIPT STRICT, NEVER `any`.** Use `unknown` and narrow it. The config
loader is the worked example.

**THE CODE STAYS WINDOWS FRIENDLY, AND v1 SHIPS macOS AND LINUX.** Those are two
different statements and both hold.

- *The rule for code you write:* no shell-string spawning, no POSIX-only paths,
  no `PREFIX=value` inline env in npm scripts. Line endings are pinned in
  `.gitattributes`, and the reason is written there: a silent CRLF break cost a
  real install once already. Keeping these habits is what makes Windows support
  later a piece of work rather than a rewrite.
- *The rule for what we CLAIM:* the released platform matrix is macOS and Linux.
  The terminal sidecar is tmux-backed and browser discovery is POSIX shaped, so
  two modules cannot work on Windows, and nothing has been run there. **Never
  imply Windows works.** Linux is shipped `untested` and the docs say so, which
  is the same convention adapters use. See the README's Platforms table.

## The architecture, in five sentences

1. `hub.config.json` is the registry: what exists. SQLite is the state: what is
   happening. That split is what makes updates safe.
2. `action_ledger` is THE ONE HISTORY. Every mutation is a row. The jobs strip,
   TODAY, undo and attribution are all views of it. Never build a second
   history table.
3. Every mutation goes through `runThroughLedger()`. If you are writing a
   mutation that does not, that is the bug.
4. Every live surface renders `ledgerSnapshot()`, delivered by one SSE stream
   per page, and `?once=1` returns the identical snapshot as JSON. One
   `snapshot()` function feeds both branches, always. The snapshot carries the
   server clock (`nowMs`), and client components format relative times against
   THAT, never `Date.now()`, or the server and hydration passes disagree.
5. Core modules ship with the hub; the user's own modules live in `userDir` and
   an update never touches anything under it.

Detail: [docs/claude/architecture.md](docs/claude/architecture.md).
Why: [docs/adr/0002-hub-architecture.md](docs/adr/0002-hub-architecture.md).

## Migrations

`MIGRATIONS` in `src/lib/migrate.ts` is an ordered array and **the index IS the
version**.

- **NEVER edit a migration that has shipped.** This app has installs in the
  wild. Editing an applied string makes those databases silently disagree with
  the code. Append a new one instead, always.
- SQLite cannot alter a CHECK constraint. Growing the state enum means
  create-new, INSERT-SELECT, DROP, RENAME. Migration 0 declares the full v1
  column set for exactly this reason.
- `PRAGMA foreign_keys` is a no-op inside a transaction, so `runMigrations`
  turns it off around the whole loop and runs `foreign_key_check` afterwards.
  Do not move that. `test/migrations.test.mjs` fails if you do.

## Before you commit

```
npm run typecheck        # tsc --noEmit
npm run check            # no absolute paths, no hardcoded ports
npm test                 # node:test, no dependencies
npm run build            # or npm run build:check to leave a running hub alone
npm run smoke            # needs a hub running; drives a real browser through every room
bash .githooks/release-check.sh
```

**`npm run smoke` is the only one of these that can tell you the app actually
works.** Everything above it checks the code; smoke checks the product. It drives
headless Chrome through every route in `smoke.json` and fails on a blank page, a
missing load-bearing element, or any console error. It exists because three
features in the build this hub came from were completely dead while typecheck,
the production build and 207 unit tests were all green: nothing in `test/`
renders a page, so nothing could have caught it. Read the header of
`scripts/smoke.mjs` before changing what it asserts, and prove any change still
fails when it should: `node scripts/smoke.mjs --plan <a plan you know is wrong>`.

⚠️ **THE TARGET MATTERS AS MUCH AS THE ASSERTIONS, and this is why smoke is NOT
in a pre-push hook here.** A smoke run only means something if it hits the code
you are about to push. If you are serving a production build (`npm start`), the
running hub can be days older than your working tree, so a hook would smoke the
OLD build and report green on your NEW commit. That false green is worse than no
gate. Run smoke against `npm run dev`, or against a build you just made, and know
which one you hit. The first real red this gate ever produced was exactly this:
correct assertions, stale target.

The pre-commit hook runs automatically once you have run
`bash .githooks/install.sh` in this checkout. **Run it in every worktree**: the
denylist is machine local, so a fresh worktree correctly refuses every commit
until you give it one.

## Capture as you go

Found a gotcha, settled a convention, hit something that cost you an hour? Write
it down in the same pass, in its one real home: a topic doc under `docs/`, an
ADR if it is a decision, `CONTEXT.md` if it is vocabulary, `OPEN.md` if it needs
a human. Short, linked, never duplicated.
