# ADR-0002: Hub architecture

- **Status:** accepted
- **Date:** 2026-07-28
- **Slice:** 1 (the skeleton that runs)

Note on numbering: 0001 is the licensing ADR and stays where it is. The slice-1
issue text says "docs/adr/0001" for these decisions, which was written before
the licence ADR landed. This is 0002.

## Context

The hub is a generic version of a private command center that has been in daily
use. Most of these decisions were settled by living with the private one; the
value of writing them here is that the reasoning survives, so a later
contributor does not undo a scar they cannot see.

Two constraints shape everything: this ships free and public to strangers, and
it runs on THEIR machine with THEIR data.

## Decisions

### 1. Local only, by default and by construction

The server binds `127.0.0.1` unless the user's config says otherwise, and
nothing in the boot path shells out to another tool to discover a network
address.

The hub has no login. That is acceptable precisely because it is not reachable.
The moment it is reachable without a login, it is a hole. So reaching it from
another device is documented as "put a private network in front of it", never
as "change the bind to 0.0.0.0". The serve script warns loudly if a user does
the latter anyway, and it never falls open to it on its own.

**Consequence:** any future feature that wants a public URL needs an
authentication story first, and that is a separate decision.

### 2. No telemetry, and one documented network call

The hub sends nothing about the user anywhere. The single outbound call the
product will ever make is the daily GitHub Releases check, which is
unauthenticated, sends no identifiers, and can be switched off in config. It is
NOT BUILT YET (slice 6), and every surface that mentions it says so, because a
privacy claim stated in the present tense about code that does not exist is the
kind of inaccuracy that ages into a lie.

Being exact about the part such a claim usually skips: when it does ship, GitHub
will see the request itself, which is an IP address and a user agent, the same
as any web request from any browser. The payload carries nothing. Saying only
"it sends no identifiers" is true and incomplete, and for a product whose whole
differentiator is being more precise about privacy than the competition, a
reader who spots the gap loses more trust than the omission saves.

This is enforced four ways, because a promise in a README is worth nothing:

- `scripts/next-run.mjs` is the ONE place Next.js is ever launched, and it is
  where `NEXT_TELEMETRY_DISABLED` is set. A stock Next app phones home on build
  AND on dev. The first draft of this repo set the switch in four entry points
  and left `"build": "next build"` bare in `package.json`, which was the one
  command the README told users to run: a stranger following the quick start
  would have emitted a build ping on a product whose headline is that it sends
  nothing. One boot path, one switch, is the structural answer.
- `.githooks/release-check.sh` fails if any `package.json` script invokes `next`
  outside that path.
- The pre-commit hook blocks REACH, not a list of known-bad names: any
  non-loopback URL, any network-capable module import, any curl or wget under
  `src/` or `scripts/`, unless the line carries `hub-allow-network:` or
  `hub-no-request:` and a reason. The earlier name-list version let curl through
  `child_process`, a WebSocket, `undici`, `node:net` and an image beacon commit
  clean, which is the wrong shape for the gate backing the headline claim.
- The verify walk records the browser's full request list, and the expected
  value is zero external requests.

**Consequence:** no error reporting service, no analytics, no CDN fonts, no
remote config. If we ever want usage numbers, the only honest mechanism is
something the user chooses to send, and that is a new ADR.

### 3. Config first: one registry, zero hardcoded paths

Every path and every port comes from `hub.config.json` through one validating
loader. Three properties fall out of it, and all three are load bearing:

- **Defaults first.** Every knob has a module-constant fallback, so a missing
  or half-written config still boots. Setup is never a prerequisite for the app
  starting, which matters enormously for the "even a non-technical friend can
  get going" bar this product is held to.
- **Honest absence.** An unconfigured surface resolves to `null` and the UI says
  it is not configured. It never errors and never invents data.
- **Named errors.** A validation failure says exactly which key in which
  section is wrong, in plain language. The user editing this file is not a
  developer.

`hub.config.json` is GITIGNORED and `hub.config.example.json` is tracked. That
is not tidiness: if the live config were tracked, every user who edited it would
hit a merge conflict on the update path, which directly contradicts decision 5.
The loader falls back to the example, then to defaults, so a fresh clone runs
before anyone has copied anything.

**Consequence:** `scripts/check-paths.mjs` enforces the rule mechanically, wired
into the `check` script, the pre-commit hook and the release check. There is no
test framework in this project, so the enforcement had to be dependency free.

### 4. The ledger is the one history

One SQLite table, `action_ledger`, records every mutation the hub performs.
Everything else is a view of it: the jobs strip, the TODAY digest, undo,
attribution.

The rule holds in practice because every mutation goes through one function,
`runThroughLedger()`, which inserts a running row, executes, and settles the row
done or failed with its artifacts and commits. A thrown error becomes a failed
row, never a lost one.

Two consequences of that shape are worth stating:

- **Undo is defined.** It is a git revert of exactly the commits recorded on the
  row, which is why the commits are recorded rather than derived later.
- **The migration set is conservative.** SQLite cannot alter a CHECK
  constraint, and growing an enum later means a rebuild-and-copy dance on
  databases in the wild. So migration 0 declares the full v1 column set and the
  full state enum, including columns no slice uses yet (`job`, `pid`,
  `transcript`, `route`, `started_at`). The array index is the version, and an
  applied migration is never edited.

**Consequence:** proposing a second history table is proposing to break the
product's central idea. If a future feature seems to need one, the answer is
almost certainly a new column or a view.

Also settled here: the database has a SINGLE WRITER, the web process. Long
running children talk through files (a spec in, a transcript and a status file
out) and never open SQLite. That is what makes WAL safe and lets the helper
scripts stay dependency free.

### 5. User space is never touched by updates, by construction

Three things are the user's and are gitignored: `hub.config.json`, `userDir`
(their own modules and pages), and `dataDir` (their database). Because none of
them is tracked, the fast update path is a plain `git pull` that cannot
conflict with anything of theirs.

"By construction" is the point. A rule that says "the updater must not
overwrite user files" is a rule someone eventually breaks. A tree where the user
files are not in it cannot be broken that way.

**Consequence:** anything we later want to ship as a default must ship as an
example or a core module, never as a file the user is expected to edit in place.

### 6. Multi-adapter: the hub is not tied to one AI vendor

The user names whatever command-line AI tool they already use and already pay
for, in `adapters`. Nothing in the schema, the config or the routes is named
after a vendor, from the first commit, because renaming a table later costs a
rebuild-and-copy migration on live installs.

An adapter that is built to spec but has never been run against a real install
carries `untested: true`, and the UI says so. Shipping something we have not
exercised is fine; implying we have is not.

**Consequence:** the hub can never assume a specific tool's flags, output
format, or session model in shared code. Anything vendor-specific belongs behind
the adapter seam.

### 7. Honest empty states, never sample data, and BROKEN IS NOT EMPTY

A surface with nothing in it says so, in plain words. No placeholder rows, no
demo data, no "example item" that a new user has to work out is fake.

The half that is easy to miss is the failure case. A hub that cannot read its
own database produces exactly the same page as a healthy fresh install: zero
running, zero queued, "No jobs yet". The user concludes the hub is idle, and
once real jobs run, work vanishes into the only history the product has. So the
snapshot carries `degraded`, the UI renders it, and the reason is logged.
Swallowing an error into a plausible zero is banned by the same rule that bans
sample rows, and for the same reason: both teach the user not to trust the page.

**Consequence:** slice 1's TODAY page renders three empty cards and a setup note,
and that is the correct deliverable rather than a shortcoming.

### 8. Production is the default run mode; dev is opt in

`./start.sh` builds once if it has to and then serves the built app.
`./start.sh dev` is the contributor path.

The first draft had it the other way around. Dev mode is the wrong default for
something that runs all day on a non-technical person's laptop: routes compile
on first request, a file watcher runs forever, server modules re-evaluate on
every reload, and the cross-origin dev block that costs a paragraph in
`next.config.ts` exists ONLY in dev, so the confusing "page renders, every click
is dead" failure is one the product would have been opting its users into. It
also means the configuration shipped to users would have been the one tested
least under load.

**Consequence:** live pickup of a user's own modules and pages is a dev-mode
property, not a shipped one. When the module system lands (slice 7) it has to
either work in production or say plainly that changing a module needs a restart.

## What this rules out

- A hosted version, an account system, or anything that needs a server we run.
- Any analytics, crash reporting, or "anonymous usage" collection.
- A second history table, a second snapshot shape, or a second stream helper.
- Vendor-named tables, routes, or config keys.
- Editing a shipped migration.

## Related

- [ADR-0001](0001-mit-license-cc0-setup-prompt.md): MIT repo-wide, CC0 for the
  setup prompt, attribution as a product feature rather than a licence term.
- [docs/claude/architecture.md](../claude/architecture.md): how the pieces fit,
  and where later slices plug in.
