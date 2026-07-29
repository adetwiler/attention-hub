# ADR-0005: The terminal is a loopback sidecar, tmux-backed, off by default and owner-only forever

- **Status:** accepted
- **Date:** 2026-07-29
- **Context:** v1 leads with the live wall, and a wall of read-only mimics is not that. Ported from a working private implementation, so the traps below were already paid for once.

## Context

One pane of the wall has to be a real shell in a real directory, so a dev server
or a git command can be run from the hub instead of from another window. That is
the most powerful thing this product will ever do and the most dangerous, and the
two facts arrive together: it ships in the same release as its security, or it
does not ship.

Three things about the environment force most of the shape:

- An App Router Node route handler cannot perform a WebSocket upgrade, and the
  boot script (`scripts/serve.mjs`) spawns the framework CLI as a **child
  process**, so there is no in-process server object to attach an `upgrade`
  listener to even if a handler could.
- `node-pty` is a native module. In the app's `package.json` the production build
  tries to bundle it and fails.
- `src/lib/db.ts` declares a single writer: only the web process opens the SQLite
  file, which is what makes WAL safe here.

## Decision

### 1. A separate process, with its own package

`pty/server.mjs`, `ws` plus `node-pty`, bound to loopback. Its own
`package.json`, so the native dependency never reaches the app. The app depends
only on the xterm browser packages.

### 2. tmux-backed by default, raw pty as the fallback

A session is `tmux new-session`, named `<prefix>-<pane id>`. That buys survival
of navigation, of a sidecar restart, of the hub updating itself, and of sleep,
and it makes the no-lockout contract literally true: every session the hub opens
is attachable from a real terminal, so the hub can never be the thing that traps
a process. Without tmux the sidecar opens a raw pty and the pane says what that
costs.

### 3. The client sends a pane id. The server decides everything else.

The working directory, the session name and the shell come from
`hub.config.json`, resolved server side by `grantFor()` in `src/lib/terminal.ts`.
The browser cannot ask for a directory or a command, so a page that steals the
hub's session cannot ask for one either.

### 4. Four doors, together, in the first release

- **Loopback only**, and the bind address is deliberately not a config key.
  The sidecar refuses any non-loopback peer as well, independently of any door in
  front of the hub.
- **A single-use short-TTL grant**, minted by the hub over **same-origin** HTTP,
  carried in the first WebSocket **message** and never in a URL, stored in the
  database as a SHA-256 hash. The same-origin check is the actual door: any
  website you visit can POST to a loopback port, and cannot forge `Origin`.
- **An idle timeout** that drops the socket while the tmux session survives.
- **A ledger row per attach and per spawned session**, and never a transcript.

The sidecar cannot check a token itself, because of the single-writer rule, so it
redeems over loopback against `/api/terminal/redeem`. That constraint turned out
to be a security property: the sidecar is TOLD where to open a shell.

### 5. Off by default. Owner-only, permanently.

`TERMINAL_MODULE` in `src/lib/terminal.ts` is the module manifest, in code
because there is no module system yet (post-v1) and because a rule with a
mechanism behind it is a rule. `enabledByDefault: false` and `ownerOnly: true`
are pinned by `test/terminal.test.mjs` and by `.githooks/release-check.sh`, which
also fails if the shipped example config ever has the module switched on.

Owner-only is **not** a v1 limitation. There is no version of this product in
which a second person's browser session opens a shell on someone else's machine.

### 6. macOS and Linux, said plainly

The sidecar is tmux-based, so the repo's Windows-is-first-class rule does not
reach this module. On Windows the pane says so. Faking a Windows path here would
ship a promise that breaks on first use, which is worse than a stated gap.

## Consequences

- The hub has one more process to run, and therefore a service definition
  (`pty/deploy/`) that the setup page has to walk a user through. Without it the
  terminal is dead after every reboot while everything else comes back.
- A user who exposes the hub to the internet with this module on has handed out a
  root shell. The config comment and the docs say it in those words, and #8 owns
  saying it on the setup page.
- The pane never resizes a tmux-backed session, so attaching from a small screen
  shows part of a big session rather than reflowing it. That is the deliberate
  trade: the alternative is a phone destroying a desk layout (see
  [docs/terminal.md](../terminal.md) trap 2, measured both ways).
- There is no kill affordance, by design. Recovery is `tmux attach` in a real
  terminal.

## Alternatives rejected

**A route handler with a custom server.** Would mean replacing the framework CLI
with a custom Node server to own the upgrade path, which is a much larger change
to the one file whose job is booting the product, for a module that ships off.

**Bearer token in the WebSocket URL.** Simplest to write, and it puts a live
shell grant into browser history and any proxy log in the path.

**The sidecar reading the database directly.** Removes the loopback redeem hop,
breaks the single-writer rule that makes WAL safe here, and adds a second native
dependency (`better-sqlite3`) to the sidecar's package.

**A long-lived token in the config.** A secret in a file that a user might paste
into an issue, that never expires, and that nothing can revoke.

**Enabled by default with a warning.** The warning is read once and the shell is
open forever. A stranger's first install does not come with a browser shell.
