# Verify walk: slice 11, the terminal module, driven end to end

- **Date:** 2026-07-29
- **Slice:** 11, the terminal pane and its pty sidecar
- **Platform:** macOS 26.5.2 arm64, Node 24.16.0, Next 16.2.12, tmux 3.5a, node-pty 1.1.0, dev mode
- **Instrument:** a throwaway WebSocket harness (the `ws` client already in
  `pty/node_modules`), NOT a browser. See "What could NOT be walked".

The point of this walk was to find out whether the ported design actually works
on a machine rather than whether it reads well. It found **two real bugs and one
ugly failure message**, all three of which shipped fixed in the same branch, and
it turned three claims that were inherited from the upstream design into
measurements taken here.

## How it was driven

A hub on `127.0.0.1:2986` and the sidecar on `127.0.0.1:2987` (ports moved off
the defaults so nothing collided with a hub already running on this machine), a
`hub.config.json` with `terminal.enabled: true`, `sessionPrefix: hubverify`, and
two panes: `{ id: shell, kind: terminal, cwd: "." }` plus a placeholder.

The harness minted grants over HTTP exactly as the pane does, opened WebSockets,
sent the token as the first message, typed into the shell, and measured tmux from
outside with `tmux list-windows`, `has-session` and `list-clients`. Where the
claim was "a process kept running", the evidence is a FILE the process appends
to, not a terminal redraw: a screen repaint can fake the second, not the first.

## Measured, 26 checks, all passing

**The door**

- A mint POST with no `Origin` header is refused (403).
- A mint POST with another site's `Origin` is refused (403).
- A mint for a `placeholder` pane is refused, and the message says which kind it is.
- A mint for a pane that does not exist is refused, and lists the panes that do.
- Sending input before presenting a grant closes the socket with a reason.
- A grant cannot be redeemed twice ("that grant was already used once").
- A malformed token is refused on shape, with no database lookup.
- A grant redeemed 32 seconds after minting is refused ("expired"), TTL 30s.
- The sidecar is **unreachable on this machine's own network address**:
  `ECONNREFUSED` connecting to its LAN IP on the sidecar port. Loopback bind holds.
- All 17 grants in the database are 64-character hashes. No token is stored.
- 17 `terminal-attach` and 14 `terminal-session` rows in `action_ledger`: every
  mint and every spawned session recorded, and no transcript column touched.

**The shell**

- Attach creates `hubverify-shell` and reports it, tmux-backed, ignore-size available.
- `echo VERIFY_ONE_MARKER` ran in the real shell and came back over the socket.
- Reattach after a detach replays 531 bytes / 49 lines of history, including the
  marker typed before the detach. Not a blank screen.

**Survival, measured off a file the process appends to**

- 3 lines before detaching, 9 after 5 seconds with **nothing attached**. The
  session and its background process kept running.
- The session survives the socket closing.
- The session survives the SIDECAR BEING KILLED: with the sidecar dead, the
  witness file grew from 3 lines to 8, `has-session` still true, and a restarted
  sidecar reattached to the same session and replayed its history.
- **Idle timeout** (run separately with `idleMinutes: 1`): the socket was dropped
  at 72 seconds with a status message explaining that the session is still
  running, and `has-session` was still true afterwards.

**The size trap, measured both ways**

One session, two pty clients, window size read from `tmux list-windows`:

| | after the 200x49 client | after the 60x19 client |
|---|---|---|
| no `-f ignore-size` | 200x48 | **60x18** |
| `-f ignore-size` on the second client | 200x48 | 200x48 |

Both clients were attached at the same time (`list-clients` reported 200x49 and
60x19), so this is the real scenario and not a proxy for it. The trap is real on
this machine, and the flag fixes it.

## Found and fixed

**1. The history replay was silently doing nothing.**
`tmux capture-pane -p -t =<session>` exits 1 with `can't find pane: =<session>`,
because `=name` is a session target and `capture-pane` takes a PANE target. The
sidecar swallowed the failure and sent an empty replay, so a reattach showed a
blank screen: exactly the symptom the replay was written to prevent, in the
feature whose whole job is to prevent it. `=<session>:` works and keeps the
exact match, which matters because a bare name is a PREFIX match and panes named
`shell` and `shell2` would produce ambiguous sessions. The sidecar now also warns
on a failed capture instead of returning "" quietly.

**2. `-f ignore-size` on the CREATING client leaves the session the wrong size,
and `new-session -x/-y` does not fix it.** With `window-size` at its default
(`latest`) and a tmux server that already has clients, a detached `new-session -x
200 -y 49` ignored the request and inherited another client's size: asked for
200x49, measured 116x32. The rule the sidecar now implements: the attach that
CREATES a session omits the flag (tmux then does the geometry, status bar
included, giving 200x48 for a 49-row client), and every attach to an existing
session carries it.

**3. `EADDRINUSE` was an unhandled `error` event and a stack trace.** Starting a
second sidecar printed Node internals. It now names the port and says that
another copy is probably already running.

Two smaller things the run tidied: the idle message said "1 minutes", and the
pane could stack a second xterm inside the same host element on REATTACH.

## What could NOT be walked

**The Chrome walk in the issue's "done means" is still owed.** The
Claude-in-Chrome extension needs the owner to connect a browser, so no agent can
do it (`docs/claude/parallel-agent-builds.md` says so, and it stays owed rather
than being quietly claimed). Specifically unwalked:

- xterm actually rendering in a pane, and the theme against the hub's palette.
- Keyboard focus: the wall's number keys must not steal a keystroke from the
  shell. `PaneGrid` already skips its handler for `TEXTAREA` targets and xterm's
  input element is a textarea, so this is reasoned, not seen.
- Fullscreen and solo re-fitting the terminal (the `ResizeObserver` path).
- The phone half of the size trap on a real phone. The 60x19 client here was a
  pty, which is what tmux sees either way, but nobody has held a phone.

**Not tested on Linux.** The sidecar is macOS and Linux by design and only macOS
was available. The Linux-specific parts are the systemd unit and node-pty's
prebuild layout, both of which are exercised by the same code paths.

**A stranger's first install.** `npm install` in `pty/` was run here, and it
confirmed the trap that matters most for a public template: node-pty shipped
`spawn-helper` at mode `644` in TWO prebuild directories
(`prebuilds/darwin-arm64`, `prebuilds/darwin-x64`) and the postinstall corrected
both to `755`. Note that they are under `prebuilds/`, not `build/Release`, which
is why the script searches by name.

## How to re-run the gates

```
npm run typecheck
npm run check
npm test
npm run build:check
bash .githooks/release-check.sh
```
