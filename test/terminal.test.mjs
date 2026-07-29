// The terminal module's rules. This is the hub's largest security surface, so
// what is pinned here is every refusal and every permanent rule, not the happy
// path: an unknown pane, a pane of the wrong kind, a module switched off, a
// directory that is not there, a token that is malformed, reused or stale.
//
// The two rules at the top of the file are the ones that must never quietly
// change: the module ships DISABLED, and it is owner-only permanently. If a
// future refactor flips either, this file fails, which is the point of writing
// the manifest in code instead of in a sentence in a doc.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTs, NO_TS } from "./_ts.mjs";

const terminalMod = await loadTs("src/lib/terminal.ts");
const configMod = await loadTs("src/lib/config.ts");
const skip = terminalMod === null || configMod === null ? NO_TS : false;

describe("the terminal module", { skip }, () => {
  const {
    TERMINAL_MODULE,
    GRANT_TTL_SECONDS,
    grantFor,
    grantExpiry,
    hashToken,
    isLoopbackAddress,
    looksLikeToken,
    mintToken,
    moduleProblem,
    paneCwd,
    sameToken,
    sessionName,
    sidecarUrl,
  } = terminalMod ?? {};
  const { loadConfig, resetConfigCache } = configMod ?? {};

  const originalCwd = process.cwd();
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hub-terminal-"));
    process.chdir(dir);
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    resetConfigCache();
  });

  const write = (obj) => writeFileSync(path.join(dir, "hub.config.json"), JSON.stringify(obj));
  const realDir = (name) => {
    mkdirSync(path.join(dir, name), { recursive: true });
    return name;
  };
  /** A config with the module on and one terminal pane, which is the base case
   * every refusal below is a departure from. */
  const enabled = (extra = {}) => ({
    terminal: { enabled: true, ...extra.terminal },
    wall: { panes: [{ id: "shell", kind: "terminal", cwd: realDir("work") }], ...extra.wall },
  });

  // ---------------------------------------------------------------- permanent
  test("the module ships DISABLED and is owner-only, permanently", () => {
    assert.equal(TERMINAL_MODULE.enabledByDefault, false);
    assert.equal(TERMINAL_MODULE.ownerOnly, true);
  });

  test("the module states its platforms rather than implying every platform", () => {
    assert.deepEqual([...TERMINAL_MODULE.platforms], ["macos", "linux"]);
  });

  test("the default config leaves it off, and says which key turns it on", () => {
    write({});
    const problem = moduleProblem(loadConfig().terminal);
    assert.match(problem, /switched off/);
    assert.match(problem, /"terminal": \{ "enabled": true \}/);
    assert.match(problem, /docs\/terminal\.md/);
  });

  // ---------------------------------------------------------------- resolving
  test("a pane resolves to a session name and the directory config gave it", () => {
    write(enabled());
    const { grant, problem } = grantFor(loadConfig(), "shell", "/nowhere");
    assert.equal(problem, null);
    assert.equal(grant.session, "hub-shell");
    assert.equal(grant.paneId, "shell");
    assert.equal(path.basename(grant.cwd), "work");
    assert.equal(grant.tmux, true);
  });

  test("the session prefix is config, so two hubs on one machine do not collide", () => {
    write(enabled({ terminal: { sessionPrefix: "other" } }));
    assert.equal(grantFor(loadConfig(), "shell", "/nowhere").grant.session, "other-shell");
    assert.equal(sessionName("p", "pane"), "p-pane");
  });

  test("a switched-off module grants nothing, whatever pane is asked for", () => {
    write({ wall: { panes: [{ id: "shell", kind: "terminal" }] } });
    const { grant, problem } = grantFor(loadConfig(), "shell", dir);
    assert.equal(grant, null);
    assert.match(problem, /switched off/);
  });

  test("an unknown pane is refused, and the message lists the panes there are", () => {
    write(enabled());
    const { grant, problem } = grantFor(loadConfig(), "ghost", dir);
    assert.equal(grant, null);
    assert.match(problem, /No pane called "ghost"/);
    assert.match(problem, /have: shell/);
  });

  test("a pane of another kind cannot be talked into being a terminal", () => {
    write({
      terminal: { enabled: true },
      wall: { panes: [{ id: "look", kind: "browser" }] },
    });
    const { grant, problem } = grantFor(loadConfig(), "look", dir);
    assert.equal(grant, null);
    assert.match(problem, /is a browser pane, not a terminal/);
  });

  test("a directory that is not there is a refusal naming the key to fix", () => {
    write({
      terminal: { enabled: true },
      wall: { panes: [{ id: "shell", kind: "terminal", cwd: "nope-not-here" }] },
    });
    const { grant, problem } = grantFor(loadConfig(), "shell", dir);
    assert.equal(grant, null);
    assert.match(problem, /does not exist/);
    assert.match(problem, /wall\.panes\[\]\.cwd for "shell"/);
  });

  test("the module's own cwd is checked too, and named as terminal.cwd", () => {
    write({
      terminal: { enabled: true, cwd: "also-not-here" },
      wall: { panes: [{ id: "shell", kind: "terminal" }] },
    });
    assert.match(grantFor(loadConfig(), "shell", dir).problem, /"terminal\.cwd"/);
  });

  test("panes derived from profiles can be terminals too", () => {
    // wall.paneKind terminal plus one profile: the pane list is derived, and the
    // grant has to resolve for exactly the panes the wall shows.
    write({
      terminal: { enabled: true, cwd: realDir("home") },
      profiles: { work: { configDir: realDir("cfg") } },
      wall: { paneKind: "terminal" },
    });
    const { grant, problem } = grantFor(loadConfig(), "work", dir);
    assert.equal(problem, null);
    assert.equal(grant.session, "hub-work");
    assert.equal(path.basename(grant.cwd), "home");
  });

  test("cwd falls back pane, then module, then home, in that order", () => {
    const pane = (cwd) => ({ id: "x", kind: "terminal", profile: null, label: null, cwd });
    assert.equal(paneCwd(pane("/pane"), { cwd: "/module" }, "/home"), "/pane");
    assert.equal(paneCwd(pane(null), { cwd: "/module" }, "/home"), "/module");
    assert.equal(paneCwd(pane(null), { cwd: null }, "/home"), "/home");
  });

  // ---------------------------------------------------------------- the socket
  test("the sidecar address is loopback unless config says otherwise", () => {
    assert.equal(sidecarUrl({ url: null, port: 4321 }), "ws://127.0.0.1:4321");
    assert.equal(sidecarUrl({ url: "wss://your-proxy.example.com/pty", port: 4321 }), "wss://your-proxy.example.com/pty");
  });

  test("loopback is loopback in every shape a socket reports it", () => {
    for (const good of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.1.2.3", "localhost"]) {
      assert.equal(isLoopbackAddress(good), true, good);
    }
    for (const bad of ["192.168.1.10", "10.0.0.4", "8.8.8.8", "", null, undefined, "0.0.0.0"]) {
      assert.equal(isLoopbackAddress(bad), false, String(bad));
    }
  });

  // ---------------------------------------------------------------- tokens
  test("a token is 32 random bytes and never repeats", () => {
    const a = mintToken();
    const b = mintToken();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
  });

  test("the database holds a hash, so the file is not a stack of shell grants", () => {
    const token = mintToken();
    const hash = hashToken(token);
    assert.notEqual(hash, token);
    assert.equal(hash, hashToken(token));
    assert.notEqual(hash, hashToken(mintToken()));
    assert.equal(sameToken(hash, hashToken(token)), true);
    assert.equal(sameToken(hash, hashToken(mintToken())), false);
    // Different lengths must not throw: timingSafeEqual does, on its own.
    assert.equal(sameToken(hash, "short"), false);
  });

  test("a malformed token is rejected on shape, before any lookup", () => {
    assert.equal(looksLikeToken(mintToken()), true);
    for (const bad of ["", "not-a-token", "AB".repeat(32), "a".repeat(63), "a".repeat(65), 12, null, {}]) {
      assert.equal(looksLikeToken(bad), false, String(bad));
    }
  });

  test("a grant lives seconds, not hours, and expires in SQLite's own format", () => {
    assert.ok(GRANT_TTL_SECONDS > 0 && GRANT_TTL_SECONDS <= 120);
    const at = Date.UTC(2026, 6, 29, 12, 0, 0);
    assert.equal(grantExpiry(at, 30), "2026-07-29 12:00:30");
    // The format has to compare correctly against datetime('now'), which means
    // no T and no trailing Z.
    assert.match(grantExpiry(at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
