# The terminal module

A `terminal` pane on the wall is a real shell on this machine, in a directory you
name, reached from a browser tab. You can start a dev server in it, run a git
command, tail a log, and it keeps running when you navigate away.

It ships **switched off**, and this page is what to read before switching it on.

**macOS and Linux.** The sidecar keeps sessions alive with tmux, so this is the
one module where the repo's Windows-is-first-class rule does not reach. There is
no Windows path and none is faked: on Windows the pane says so instead of
offering a button that cannot work.

## Turning it on

```jsonc
// hub.config.json
"terminal": { "enabled": true },
"wall": {
  "panes": [
    { "id": "shell", "kind": "terminal", "label": "SHELL", "cwd": "~/your-project" }
  ]
}
```

Then install and start the sidecar:

```
cd pty
npm install     # installs node-pty and ws, and runs the chmod that matters
npm start
```

Restart the hub after a config change (`loadConfig()` caches for the life of the
process), and keep the sidecar running across reboots with one of the service
files in [pty/deploy/](../pty/deploy). Every path in those files is a
placeholder you replace: `HUB_DIR` and `NODE_BIN`.

Without a service definition the terminal is dead after every reboot while the
rest of the hub comes back, which reads as the hub being broken rather than one
service being down.

## What it is made of

| Piece | What it does |
|---|---|
| `pty/server.mjs` | The sidecar. A loopback WebSocket in front of a tmux-backed pty. |
| `pty/postinstall.mjs` | The `chmod +x` on node-pty's `spawn-helper`, on every install. |
| `pty/deploy/` | launchd plist and systemd unit, so it survives a reboot. |
| `src/lib/terminal.ts` | The rules: what a pane may open, and the module manifest. No I/O. |
| `src/lib/terminalGrants.ts` | The grant store: mint and single-use redeem. |
| `src/app/api/terminal/session` | Mint a grant (same-origin POST), and a readiness GET. |
| `src/app/api/terminal/redeem` | The sidecar spends a grant here, over loopback. |
| `src/components/TerminalPane.tsx` | The pane body: xterm, and honest states. |

**Why a separate process.** App Router Node handlers cannot perform a WebSocket
upgrade, and the hub's boot script spawns the framework CLI as a child process,
so there is no in-process server object to attach an `upgrade` listener to. The
sidecar also has its **own `package.json`**, which is what keeps `node-pty` (a
native module) out of the app bundle. The app depends only on the xterm browser
packages.

## Security

A browser pty is remote code execution by design. On this machine it reaches your
keys, your databases and your push credentials. That is what a shell is, and it
is why the module is off until you decide otherwise.

Four doors, all on by default, none of them a setting:

1. **Loopback only.** The sidecar binds `127.0.0.1` and refuses any non-loopback
   peer, independently of whatever is in front of the hub. The bind address is
   deliberately not configurable.
2. **A grant, not a port.** A connection is worth nothing without a single-use,
   short-lived token that only the hub's own pages can mint. The mint route
   requires a same-origin `Origin` header, which a page on another site cannot
   forge, and that refusal is the actual door: without it, any website you visit
   could ask your own hub for a shell. The token arrives as the first WebSocket
   **message** and never in a URL, because URLs land in history, proxy logs and
   referrer headers. The database stores only its SHA-256 hash.
3. **Idle timeout.** Silence drops the socket. The tmux session survives, so
   nothing is lost and there is no forgotten open shell in a background tab.
4. **A ledger row per attach and per session.** It records that a terminal was
   attached and which session it opened, never what was typed. A keystroke log
   would be a secret-bearing file, and this product does not create one.

**Owner only, permanently.** In a multi-person install no role but the owner ever
gets a pty. This is a permanent rule, not a v1 limitation: it lives in
`TERMINAL_MODULE` in `src/lib/terminal.ts`, the pane reads it, and both
`test/terminal.test.mjs` and `.githooks/release-check.sh` fail if it is flipped.

**The one thing left to you: do not put the hub on the open internet.** It has no
login. With this module on, exposing it is handing out a shell. Reach it from
another device through a private network, never through a port forward.

## No lockout, ever

Sessions are `tmux new-session`, named `<terminal.sessionPrefix>-<pane id>`, so
every session the hub opens is reachable from a real terminal:

```
tmux ls
tmux attach -t hub-shell
```

The hub has no kill affordance, on purpose. Recovery is always possible from a
terminal, so the hub can never be the thing that traps a process.

## The traps, all of them measured

Every one of these fails **silently**. That is why they are written down.

### 1. `spawn-helper` installs non-executable

node-pty's prebuild installs its `spawn-helper` binary without the executable
bit. The install succeeds, the require succeeds, and the first attempt to open a
shell dies with `posix_spawnp failed`, which mentions nothing about a file mode.

`pty/postinstall.mjs` fixes it on **every** install, which is the point: a manual
`chmod` is undone by the next `npm ci` and the terminal breaks again weeks later
for no visible reason. Measured here (node-pty 1.1.0, macOS arm64): two helpers
shipped at mode `644` and were corrected to `755`. Note the location: they are
under `node_modules/node-pty/prebuilds/<platform>/`, not `build/Release`, so the
script searches by NAME rather than by a hardcoded path.

### 2. `-f ignore-size`, and the half of it that is not a flag

Without `-f ignore-size` on attach, tmux resizes a shared session to fit the
newest client. Attaching from a phone therefore collapses a desk session and
destroys the layout from the pocket. Measured on tmux 3.5a, one session, two pty
clients:

| | window after the 200x49 client | after the 60x19 client |
|---|---|---|
| no flag | 200x48 | **60x18** (the trap) |
| `-f ignore-size` | 200x48 | 200x48 |

Grouped sessions (`new-session -t`) do not fix this. The flag arrived in tmux
3.0, so the sidecar checks `tmux -V` and, on anything older, attaches without it
and says loudly what that costs rather than failing.

**The half that is easy to get wrong:** the flag must NOT be used by the client
that CREATES the session, or the session keeps whatever size it was created with
and the first client sees a wrongly sized shell forever. And `new-session -x -y`
does not settle it either: with `window-size` at its default of `latest` on a
tmux server that already has clients, a detached session **ignores** `-x/-y` and
inherits another client's size. Asked for 200x49 here and measured 116x32. So the
rule the sidecar implements is:

- **it created the session**: attach WITHOUT the flag, and let tmux work out the
  geometry (a 49-row client gives a 48-row window, because the status bar takes
  one). No arithmetic in our code gets that right for every configuration.
- **the session already existed**: attach WITH the flag, always. That session
  belongs to whoever is in it.

### 3. Replay history, or a reattach looks broken

On attach to an existing session the sidecar sends
`tmux capture-pane -p -S -<scrollback>` and then goes live. Without it a reattach
is a blank screen until you press a key, which reads as a lost session.

**The target needs a trailing colon.** `capture-pane -t =<session>` fails with
`can't find pane`, because `=name` is a session target and this command takes a
pane target. It exits 1, prints to stderr, and the replay comes back empty, which
is exactly the symptom the replay exists to prevent. `=<session>:` works and
keeps the exact match, and the exact match matters: a bare name is a PREFIX
match, so panes named `shell` and `shell2` would give sessions `hub-shell` and
`hub-shell2` and the wrong one could be replayed. Caught by running it, not by
reading it.

### 4. The sidecar needs its own service definition

See the top of this page. `pty/deploy/`.

## What the pane does, and does not do

- **It does not connect by itself.** Opening the wall must not open four shells,
  and the most powerful surface in the product is the wrong place for a default.
  There is an ATTACH button, and the pane says what pressing it does.
- **It never resizes a tmux-backed session**, for the reason in trap 2. The
  browser sends its size, and the sidecar uses it only for a raw pty, which has
  exactly one client.
- **It says what is wrong.** Module off, sidecar not running, tmux missing, grant
  expired, folder gone: each is a sentence in the pane naming the key or the
  command that fixes it. A pane that cannot connect is broken, not empty.

## Without tmux

The sidecar falls back to a raw pty and says so in the pane. Everything still
works, and nothing survives: no navigation, no sidecar restart, no idle timeout,
and no attaching from a real terminal. Install tmux.

## Related

- [docs/adr/0007-terminal-sidecar-and-its-trust-model.md](adr/0007-terminal-sidecar-and-its-trust-model.md), why it is shaped this way.
- [docs/adr/0004-pane-content-contract.md](adr/0004-pane-content-contract.md), how a pane kind plugs into the wall.
- [docs/verification/2026-07-29-slice-11-terminal.md](verification/2026-07-29-slice-11-terminal.md), what was actually measured, and what was not.
