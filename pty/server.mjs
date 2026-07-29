#!/usr/bin/env node
// THE TERMINAL SIDECAR. A WebSocket on loopback in front of a tmux-backed pty.
//
// Run it:  cd pty && npm install && npm start
// Keep it running across reboots: pty/deploy/ has a launchd plist and a systemd
// unit. Without one of those the terminal is dead after every reboot while the
// rest of the hub comes back, which reads as "the hub broke".
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SEPARATE PROCESS AND NOT A ROUTE
//
// It cannot be a route. App Router Node handlers cannot perform a WebSocket
// upgrade, and the hub's boot script spawns the framework CLI as a CHILD
// PROCESS, so there is no in-process HTTP server object to attach an "upgrade"
// listener to even if a handler could. Both were established upstream before
// this was ported.
//
// It also must not share the app's package.json. node-pty is a native module: in
// the app's dependencies, the production build tries to bundle it and fails. The
// app gets the xterm BROWSER packages and nothing else.
//
// ---------------------------------------------------------------------------
// THE FOUR TRAPS, ALL VERIFIED, ALL SILENT FAILURES
//
// 1. spawn-helper installs NON-EXECUTABLE. The first spawn dies with
//    "posix_spawnp failed" and nothing mentions a file mode. postinstall.mjs
//    fixes it on every install, including every npm ci.
//
// 2. tmux attach WITHOUT -f ignore-size resizes EVERY client to the smallest
//    one. A phone attaching to a shared session collapses a 200x49 desk
//    terminal to 60x19 and destroys the layout from the pocket. Tested
//    upstream. Grouped sessions (new-session -t) do NOT fix it. That flag is
//    the reason this sidecar is safe to attach from a second device, and it is
//    why the session's size is fixed by whoever CREATES it (-x/-y below) and
//    never changed by a later client.
//
// 3. Attach without replaying history and a reattach is a BLANK SCREEN that
//    looks like a broken product. capture-pane -p -S -<scrollback> first, then
//    go live.
//
// 4. No service definition means the sidecar does not come back after a reboot.
//    See pty/deploy/.
//
// ---------------------------------------------------------------------------
// THE SECURITY MODEL, WHICH SHIPS WITH THE FEATURE AND NOT AFTER IT
//
// A browser pty is remote code execution by design. On this machine it reaches
// your key store, your databases and your push credentials. Four doors, all of
// them here or in the hub, none of them optional:
//
//   LOOPBACK ONLY. This process binds 127.0.0.1 and refuses any non-loopback
//   peer, independently of whatever is or is not in front of the hub.
//
//   A GRANT, NOT A PORT. A connection is worth nothing without a single-use
//   short-TTL token minted by the hub over same-origin HTTP. The token arrives
//   as the first WebSocket MESSAGE, never in the URL, and this process cannot
//   validate it itself: it asks the hub, over loopback, which is also how it
//   learns which directory to open. src/lib/db.ts's single-writer rule is why
//   (only the web process opens the database), and the security property falls
//   out of it: the client sends a token, and the SERVER says where the shell
//   opens.
//
//   IDLE TIMEOUT. Silence drops the socket. The tmux session survives, so
//   nothing is lost and there is no long-lived open shell on a forgotten tab.
//
//   A LEDGER ROW PER ATTACH AND PER SESSION, written by the hub's routes. It
//   records that a terminal was attached, never what was typed: a keystroke log
//   would be a secret-bearing file this product refuses to create.
//
// macOS and Linux only. The sidecar is tmux-backed, and this is the one module
// where the repo's Windows-first-class rule does not reach. Said plainly in
// docs/terminal.md rather than faked.
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http"; // hub-allow-network: the loopback WebSocket the browser attaches to
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws"; // hub-allow-network: same server, the upgrade half
import { spawn as spawnPty } from "node-pty";

const here = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.dirname(here);

// Defaults first, and kept in step with src/lib/config.ts and
// hub.config.example.json by .githooks/release-check.sh, which fails if the
// three disagree. A drift here listens on a port the app does not point at,
// which presents as "the terminal never connects" with no error anywhere.
const DEFAULT_PORT = 2887; // check-paths-allow: the documented default, asserted equal to hub.config.example.json and src/lib/config.ts by release-check.sh
const DEFAULT_TMUX = true;
const DEFAULT_PREFIX = "hub";
const DEFAULT_SCROLLBACK = 2000;
const DEFAULT_IDLE_MINUTES = 30;

/** Loopback, always. This is not a config knob: a pty on a network interface is
 * a root shell for the network, and no setting should be able to ask for that. */
const BIND_HOST = "127.0.0.1";

/** How long a client has to present its token before the socket is closed. */
const HANDSHAKE_MS = 5000;
/** How often the idle sweep runs. */
const SWEEP_MS = 15000;
/** tmux gained "attach-session -f ignore-size" in 3.0. Below that the flag is a
 * usage error, so the sidecar attaches without it and says what that costs. */
const TMUX_IGNORE_SIZE_MIN = 3.0;

// ---------------------------------------------------------------- config

function readHubConfig() {
  for (const file of ["hub.config.json", "hub.config.example.json"]) {
    const full = path.join(hubRoot, file);
    if (!existsSync(full)) continue;
    try {
      const parsed = JSON.parse(readFileSync(full, "utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return { file, root: parsed };
    } catch (err) {
      console.error(`[pty] ${file} is not valid JSON: ${err.message}`);
      process.exit(1);
    }
  }
  return { file: "hub.config.json", root: {} };
}

const { file: configFile, root: hubConfig } = readHubConfig();
const raw = typeof hubConfig.terminal === "object" && hubConfig.terminal !== null ? hubConfig.terminal : {};

const enabled = raw.enabled === true;
const port = Number.isInteger(raw.port) ? raw.port : DEFAULT_PORT;
const wantTmux = typeof raw.tmux === "boolean" ? raw.tmux : DEFAULT_TMUX;
const sessionPrefix = typeof raw.sessionPrefix === "string" ? raw.sessionPrefix : DEFAULT_PREFIX;
const scrollback = Number.isInteger(raw.scrollback) ? raw.scrollback : DEFAULT_SCROLLBACK;
const idleMinutes = Number.isInteger(raw.idleMinutes) ? raw.idleMinutes : DEFAULT_IDLE_MINUTES;

// The hub's own address, so this process can redeem a token. Loopback: the
// sidecar and the hub are always the same machine.
const hubBind = typeof hubConfig.bind === "object" && hubConfig.bind !== null ? hubConfig.bind : {};
const hubPort = Number.isInteger(hubBind.port) ? hubBind.port : 2886; // check-paths-allow: the hub's own documented default, asserted by release-check.sh
const hubOrigin = `http://127.0.0.1:${hubPort}`; // hub-allow-network: redeems a grant against your own hub, on loopback

// FAIL CLOSED. The module ships off, and "off" has to mean the socket does not
// exist, not just that the UI hides a button.
if (!enabled) {
  console.error(`[pty] terminal.enabled is not true in ${configFile}, so this sidecar refuses to start.`);
  console.error("[pty] Read docs/terminal.md first: enabling this gives a browser tab a real shell on this machine.");
  process.exit(1);
}
if (process.platform === "win32") {
  console.error("[pty] The terminal module is macOS and Linux only (the sidecar is tmux-backed).");
  process.exit(1);
}

// ---------------------------------------------------------------- tmux

/** The tmux version as a number, or null when tmux is not installed. */
function tmuxVersion() {
  const probe = spawnSync("tmux", ["-V"], { encoding: "utf8" });
  if (probe.error !== undefined || probe.status !== 0) return null;
  const match = /(\d+)\.(\d+)/.exec(probe.stdout ?? "");
  if (match === null) return 0;
  return Number(`${match[1]}.${match[2]}`);
}

const tmuxAt = tmuxVersion();
const useTmux = wantTmux && tmuxAt !== null;
const canIgnoreSize = tmuxAt !== null && tmuxAt >= TMUX_IGNORE_SIZE_MIN;

/** Does this session already exist? Decides whether history gets replayed. */
function tmuxHasSession(session) {
  return spawnSync("tmux", ["has-session", "-t", `=${session}`], { stdio: "ignore" }).status === 0;
}

/** Create the session detached, asking for the size of the client that wants it.
 *
 * -x and -y are a REQUEST, not a guarantee, and this cost an hour: with
 * window-size at its default of "latest" and a tmux server that already has
 * clients (the normal case on a working machine), a detached session ignores
 * -x/-y and inherits the size of another client entirely. Asked for 200x49 and
 * measured 116x32. What actually settles the size is the FIRST attach, which is
 * why the attach below omits -f ignore-size when it just created the session and
 * carries it every other time. See docs/terminal.md. */
function tmuxCreate(session, cwd, shell, cols, rows) {
  const args = ["new-session", "-d", "-s", session, "-c", cwd, "-x", String(cols), "-y", String(rows)];
  if (shell !== null) args.push(shell);
  const made = spawnSync("tmux", args, { encoding: "utf8" });
  return made.status === 0 ? null : (made.stderr ?? "tmux could not create the session").trim();
}

/** The visible history, so a reattach is not a blank screen.
 *
 * THE TARGET NEEDS THE TRAILING COLON, and this one was caught by verification
 * rather than by reading: `capture-pane -t =<session>` fails with "can't find
 * pane", because `=name` is a session target and this command takes a PANE
 * target. It exits 1 and prints to stderr, so the replay comes back EMPTY and
 * the feature it exists to provide is silently gone: a reattach shows a blank
 * screen, which is exactly the symptom the replay was written to prevent.
 * `=<session>:` resolves to that session's active pane AND keeps the exact-match
 * `=`, which matters because a plain name is a PREFIX match: with panes "shell"
 * and "shell2" the sessions are hub-shell and hub-shell2, and a prefix match
 * would replay the wrong one. Measured on tmux 3.5a. */
function tmuxReplay(session, lines) {
  if (lines <= 0) return "";
  const out = spawnSync("tmux", ["capture-pane", "-p", "-t", `=${session}:`, "-S", `-${lines}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (out.status !== 0) {
    // Never silent. An empty replay looks like a broken product, so if the
    // capture itself failed, say so where a person can read it.
    console.warn(`[pty] could not replay history for ${session}: ${(out.stderr ?? "").trim()}`);
    return "";
  }
  // Normalise to CRLF: a terminal emulator needs the carriage return, and
  // capture-pane emits bare newlines, so without this the replay staircases.
  return (out.stdout ?? "").replace(/\n/g, "\r\n");
}

// ---------------------------------------------------------------- the hub

/** Spend a grant. The hub is the only thing that can say a token is good, and
 * the answer carries the directory and session this connection may open. */
async function redeem(token) {
  let response;
  try {
    response = await fetch(`${hubOrigin}/api/terminal/redeem`, { // hub-allow-network: loopback only, to your own hub, to spend a grant
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    return { grant: null, problem: `the hub is not answering on ${hubOrigin} (${err.message})` };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return { grant: null, problem: "the hub's answer was not JSON" };
  }
  if (response.ok !== true || body.ok !== true) {
    return { grant: null, problem: typeof body.problem === "string" ? body.problem : "the hub refused the grant" };
  }
  return { grant: body, problem: null };
}

// ---------------------------------------------------------------- peers

/** The machine itself, or nothing. The TypeScript side has the same function in
 * src/lib/terminal.ts (isLoopbackAddress). Two runtimes, one rule: this file is a
 * plain .mjs that runs with no TypeScript loader, the same accepted duplication
 * as the boot script's config parser. */
function isLoopback(address) {
  if (typeof address !== "string" || address === "") return false;
  const bare = address.startsWith("::ffff:") ? address.slice(7) : address;
  return bare === "127.0.0.1" || bare === "::1" || bare.startsWith("127.");
}

/** A browser sends Origin on a WebSocket handshake and cannot forge it. A
 * non-browser client (a test harness) sends none, and is already both loopback
 * and token-bearing, so absence is allowed and a MISMATCH is not. */
function originAllowed(origin) {
  if (origin === undefined || origin === "") return true;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") return true;
  const extra = Array.isArray(hubBind.allowedDevOrigins) ? hubBind.allowedDevOrigins : [];
  return extra.some((name) => typeof name === "string" && (name === host || name === origin));
}

// ---------------------------------------------------------------- the server

const server = createServer((req, res) => {
  // There is no HTTP surface. A GET here is a person checking whether the
  // sidecar is up, so answer that one question and nothing else.
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tmux: useTmux, ignoreSize: canIgnoreSize }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("The Attention Hub terminal sidecar speaks WebSocket only.\n");
});

const wss = new WebSocketServer({ noServer: true }); // hub-allow-network: the loopback socket the browser attaches to, no client, no outbound call

server.on("upgrade", (req, socket, head) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    console.warn(`[pty] refused a non-loopback peer: ${req.socket.remoteAddress}`);
    socket.destroy();
    return;
  }
  if (!originAllowed(req.headers.origin)) {
    console.warn(`[pty] refused an origin the hub does not serve: ${req.headers.origin}`);
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

/** Every live attachment, so the idle sweep has something to sweep. */
const sessions = new Set();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function fail(ws, message) {
  send(ws, { type: "status", state: "error", message });
  ws.close(1008, "refused");
}

wss.on("connection", (ws) => {
  const live = { ws, pty: null, lastActive: Date.now(), label: "unattached" };
  sessions.add(live);

  // No token inside the handshake window and the socket is gone. An open pty
  // waiting for someone to prove themselves is the thing this avoids.
  const handshake = setTimeout(() => {
    if (live.pty === null) fail(ws, "no grant was presented, so nothing was opened");
  }, HANDSHAKE_MS);

  ws.on("message", (frame) => {
    live.lastActive = Date.now();
    let msg;
    try {
      msg = JSON.parse(frame.toString());
    } catch {
      fail(ws, "that was not a message this sidecar understands");
      return;
    }

    if (msg.type === "attach") {
      if (live.pty !== null) return; // one pty per socket, always
      void attach(live, msg).finally(() => clearTimeout(handshake));
      return;
    }
    if (live.pty === null) {
      fail(ws, "present a grant before sending anything else");
      return;
    }
    if (msg.type === "input" && typeof msg.data === "string") {
      live.pty.write(msg.data);
      return;
    }
    if (msg.type === "resize" && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
      // A tmux-backed session is NEVER resized by a client. That is trap 2: the
      // smallest attached client would otherwise dictate the size for every
      // other one. A raw pty has exactly one client, so it is safe to fit.
      if (!live.tmux) live.pty.resize(Math.max(2, msg.cols), Math.max(2, msg.rows));
    }
  });

  ws.on("close", () => {
    sessions.delete(live);
    clearTimeout(handshake);
    // Killing the pty detaches tmux. The session keeps running, which is the
    // whole reason it is tmux-backed.
    if (live.pty !== null) {
      try {
        live.pty.kill();
      } catch {
        // already gone
      }
    }
  });

  ws.on("error", () => ws.terminate());
});

async function attach(live, msg) {
  const { ws } = live;
  if (typeof msg.token !== "string" || !/^[0-9a-f]{64}$/.test(msg.token)) {
    fail(ws, "that is not a grant token");
    return;
  }
  const cols = Number.isInteger(msg.cols) ? Math.max(20, Math.min(500, msg.cols)) : 80;
  const rows = Number.isInteger(msg.rows) ? Math.max(6, Math.min(200, msg.rows)) : 24;

  const { grant, problem } = await redeem(msg.token);
  if (problem !== null) {
    fail(ws, problem);
    return;
  }

  // The shell comes from the grant, then from your environment. Never from the
  // client: the client's only input to this whole exchange is a token.
  const shell = grant.shell ?? process.env.SHELL ?? "/bin/sh";
  const tmux = grant.tmux === true && useTmux;
  live.tmux = tmux;
  live.label = `${grant.paneId} (${tmux ? grant.session : "raw pty"})`;

  const env = { ...process.env, TERM: "xterm-256color" };
  let file = shell;
  let args = ["-l"];
  let replay = "";

  let sizedByThisClient = false;
  if (tmux) {
    const existed = tmuxHasSession(grant.session);
    if (!existed) {
      const bad = tmuxCreate(grant.session, grant.cwd, grant.shell, cols, rows);
      if (bad !== null) {
        fail(ws, `tmux could not create ${grant.session}: ${bad}`);
        return;
      }
      sizedByThisClient = true;
    } else {
      replay = tmuxReplay(grant.session, Number.isInteger(grant.scrollback) ? grant.scrollback : scrollback);
    }
    file = "tmux";
    args = ["attach-session", "-t", `=${grant.session}`];
    // TRAP 2, and the exact rule, both halves measured on a real machine:
    //
    //   A session this connection just CREATED is sized BY this attach, so the
    //   flag is left off. tmux then works out the real geometry itself, status
    //   bar included (a 49-row client gives a 48-row window), which no explicit
    //   resize-window arithmetic here would get right for every configuration.
    //
    //   A session that ALREADY EXISTS belongs to whoever is in it, so the flag
    //   goes on and this attach cannot change its size. Without it, a phone at
    //   60x19 collapses a 200x48 desk session to 60x18 and destroys the layout
    //   from the pocket. Measured both ways: no flag gives 200x48 then 60x18,
    //   flag gives 200x48 then 200x48.
    if (canIgnoreSize && !sizedByThisClient) args.push("-f", "ignore-size");
  } else if (grant.tmux === true) {
    send(ws, {
      type: "status",
      state: "warn",
      message:
        "tmux is not installed, so this is a raw shell: it ends when this socket closes, and it cannot be picked up from a real terminal. Install tmux to get a session that survives.",
    });
  }

  let pty;
  try {
    pty = spawnPty(file, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: grant.cwd,
      env,
    });
  } catch (err) {
    // The famous one: spawn-helper without its executable bit. Name the fix.
    const hint = /posix_spawnp/i.test(err.message)
      ? " This is usually node-pty's spawn-helper missing its executable bit. Run: cd pty && npm install (postinstall.mjs fixes it)."
      : "";
    fail(ws, `could not open a shell: ${err.message}${hint}`);
    return;
  }

  live.pty = pty;
  live.lastActive = Date.now();
  // The grant carries the timeout, so a config change applies to the next attach
  // without restarting this process.
  live.idleMinutes = Number.isInteger(grant.idleMinutes) ? grant.idleMinutes : idleMinutes;

  send(ws, {
    type: "status",
    state: "attached",
    message: tmux
      ? `attached to ${grant.session} in ${grant.cwd}`
      : `opened a shell in ${grant.cwd} (no tmux, so it ends with this socket)`,
    session: tmux ? grant.session : null,
    cwd: grant.cwd,
    tmux,
    idleMinutes: Number.isInteger(grant.idleMinutes) ? grant.idleMinutes : idleMinutes,
    ignoreSize: tmux ? canIgnoreSize : false,
    /** True when THIS attach created the session, and therefore set its size. */
    created: sizedByThisClient,
  });

  // TRAP 3: history first, THEN live. A reattach that starts blank looks broken
  // even though nothing is wrong.
  if (replay !== "") send(ws, { type: "data", data: replay });
  if (tmux && !canIgnoreSize) {
    send(ws, {
      type: "status",
      state: "warn",
      message:
        "This tmux is older than 3.0, which has no attach -f ignore-size. Attaching from a second device WILL resize the first one. Upgrade tmux before you attach from a phone.",
    });
  }

  pty.onData((data) => send(ws, { type: "data", data }));
  pty.onExit(({ exitCode }) => {
    send(ws, {
      type: "status",
      state: "ended",
      message: tmux
        ? `detached from ${grant.session}. The session is still running: tmux attach -t ${grant.session}`
        : `the shell exited (${exitCode})`,
    });
    ws.close(1000, "ended");
  });

  console.log(`[pty] attached ${live.label} in ${grant.cwd}`);
}

// ---------------------------------------------------------------- idle sweep

setInterval(() => {
  const now = Date.now();
  for (const live of sessions) {
    const minutes = live.pty === null ? 1 : Number.isInteger(live.idleMinutes) ? live.idleMinutes : idleMinutes;
    if (now - live.lastActive < minutes * 60 * 1000) continue;
    const spell = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    send(live.ws, {
      type: "status",
      state: "idle",
      message: live.tmux
        ? `dropped after ${spell} with nothing typed. The session is still running, so attaching again picks it up exactly where it was.`
        : `dropped after ${spell} with nothing typed.`,
    });
    live.ws.close(1000, "idle");
  }
}, SWEEP_MS).unref();

// ---------------------------------------------------------------- start

// A port already in use is the most likely start-up failure (a sidecar is
// already running, or something else took the port), and Node's default for it
// is an unhandled 'error' event and a stack trace. Say the useful thing instead.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[pty] port ${port} is already in use, so this sidecar did not start.`);
    console.error("[pty] Another copy is probably already running. Check it, or change terminal.port in your config.");
  } else {
    console.error(`[pty] could not listen on ${BIND_HOST}:${port}: ${err.message}`);
  }
  process.exit(1);
});

server.listen(port, BIND_HOST, () => {
  console.log(`[pty] listening on ws://${BIND_HOST}:${port}`); // hub-no-request: prints the local address
  console.log("[pty] Local only: nothing else on your network can reach this, and a grant is required.");
  console.log(
    useTmux
      ? `[pty] tmux ${tmuxAt} backed, sessions named ${sessionPrefix}-<pane>${canIgnoreSize ? "" : " (WARNING: too old for -f ignore-size)"}`
      : "[pty] no tmux: raw ptys only, and a session ends with its socket.",
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    // Closing the sockets detaches every tmux client. Nothing is lost: that is
    // the no-lockout contract, and it is why a hub self-update is survivable.
    for (const live of sessions) live.ws.close(1001, "sidecar stopping");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
