#!/usr/bin/env node
// THE BROWSER SIDECAR. A loopback WebSocket to Chrome DevTools Protocol bridge: it keeps one
// real browser per configured profile, mirrors ONE TAB of it into a hub pane as a JPEG
// stream, and forwards clicks and keystrokes back the other way.
//
// It is a SIDECAR and not a Next route for two structural reasons: a Next route handler
// cannot perform a WebSocket upgrade, and scripts/serve.mjs spawns the `next` CLI as a CHILD
// process, so there is no in-process server object to attach an 'upgrade' listener to.
//
// WHY A SCREENCAST AND NOT AN IFRAME. An iframe cannot show most of the web. Measured
// 2026-07-29: Google, DuckDuckGo, Brave, Startpage, Ecosia and Mojeek all send
// X-Frame-Options or frame-ancestors, which is the SITE's header, and no browser is
// permitted to override it. Exactly one engine tried (Bing) could be framed. That is not a
// bug with a fix. A screencast never frames anything: it carries a picture of a real tab,
// and the site sees an ordinary browser because it IS one.
//
// THE CONSTRAINT THAT SHAPES THE WHOLE DESIGN, and it is not negotiable: since Chrome 136,
// --remote-debugging-port is IGNORED when the data directory is the default one
// (developer.chrome.com/blog/remote-debugging-port). It is deliberate hardening, because
// remote debugging can read cookies and passwords. So this process can NEVER attach to the
// browser you already have open, and no flag brings that back. It drives the hub's own
// copies instead, seeded once by `node scripts/seed-browser-profile.mjs`.
//
// THE SECURITY STORY, all of it, shipping with the first pane. A signed-in browser holds
// live sessions for every account you own, so none of this is a later slice:
//   1. LOOPBACK ONLY. A non-loopback peer is refused by this process, whatever is in front
//      of it. The listen host is not configurable.
//   2. SINGLE-USE TOKEN. The hub mints a short-TTL row in ITS OWN database and this process
//      burns it on connect. The GRANT (which profile) lives in the ROW, never in the URL, so
//      a token that leaks cannot be re-pointed at a different profile's browser.
//   3. IDLE DROP. A silent socket is closed. The browser survives, which is the point.
//   4. NO KILL PATH. This process starts and attaches. It can never quit a browser or close
//      a tab, so recovery is always possible by hand.
//   5. NO HISTORY. Nothing here records what was browsed. The hub's ledger records that a
//      pane was opened on a profile and nothing else.
//
// WHERE THE WINDOW IS, and the four things measured on macOS 2026-07-29 that decide it
// (measured with a real animated page and a rAF counter, because a still page produces no
// frames at all and would have looked identical to a broken stream):
//
//   window parked off to the side ... 92.7 fps   <- what this uses
//   window on screen ................ 92.3 fps
//   window MINIMIZED ................ 0.3 fps    <- never do this
//   --headless=new .................. 92.6 fps
//
// A parked headful window costs nothing against headless and keeps the one thing headless
// cannot give: a window you can PULL FORWARD when you need the browser's own UI (an
// extension popup, a download prompt, a file picker, a print dialog), none of which ever
// appears in a screencast of page pixels.
//
// TWO TRAPS IN THAT, both found the hard way:
//   1. --window-position IS IGNORED on macOS. Asking for -3200,0 at launch produced a window
//      at 0,61: the OS clamps a new window onto a display. Parking has to be a
//      Browser.setWindowBounds call AFTER the browser is up, which macOS honours (it still
//      clamps, leaving roughly a 40px sliver at the screen edge, and that sliver is the
//      honest cost of a browser you can raise).
//   2. MINIMIZING IS NOT PARKING. It reads as the tidy answer and it kills the mirror stone
//      dead, because a minimized window stops compositing. The 0.3 fps above is that.
//
// PLATFORMS: macOS and Linux. Windows is not supported, and this process SAYS SO on /health
// rather than starting and failing later, so the pane can explain itself instead of hanging.
import { spawn } from "node:child_process";
import { createServer } from "node:http"; // hub-allow-network: the loopback listener this sidecar IS. It binds 127.0.0.1 only, see HOST below.
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { WebSocket, WebSocketServer } from "ws"; // hub-allow-network: the CDP client and the pane socket, both loopback. This file is the browser bridge.

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ------------------------------------------------------------------ config
//
// The same two files the app's loader reads, in the same order, so the sidecar and the hub
// can never disagree about which profile is which. Read directly rather than through
// src/lib/config.ts because this process boots without TypeScript. A missing file is not an
// error: the defaults below produce a working sidecar with no profiles, and the pane then
// says honestly that none is configured.
function readConfig() {
  for (const file of ["hub.config.json", "hub.config.example.json"]) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(appRoot, file), "utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to the next candidate, then to the defaults
    }
  }
  return {};
}

const config = readConfig();
const B = typeof config.browser === "object" && config.browser !== null ? config.browser : {};

/** Expand a leading ~, then resolve a relative path against the hub root. The hub is always
 * started from its own directory, so this agrees with resolvePath() in src/lib/config.ts. */
const expand = (p) => {
  const raw = p === "~" ? os.homedir() : p.startsWith("~/") || p.startsWith("~\\") ? path.join(os.homedir(), p.slice(2)) : p;
  return path.isAbsolute(raw) ? raw : path.join(appRoot, raw);
};

const HOST = "127.0.0.1"; // NEVER configurable. Rule 1, and a config key would be a way to break it.
const PORT = Number(B.sidecarPort ?? 2887); // release-check.sh asserts this default equals hub.config.example.json and src/lib/config.ts.
const IDLE_MS = Number(B.idleMs ?? 30 * 60 * 1000);
const QUALITY = Number(B.quality ?? 60);
const WIN_POS = Array.isArray(B.windowPosition) && B.windowPosition.length === 2 ? B.windowPosition : [-3200, 0];
const WIN_SIZE = Array.isArray(B.windowSize) && B.windowSize.length === 2 ? B.windowSize : [1440, 900];
const PROFILES = Array.isArray(B.profiles) ? B.profiles : [];
const HOME_URL = typeof B.homeUrl === "string" && B.homeUrl.length > 0 ? B.homeUrl : "https://duckduckgo.com"; // hub-no-request: a default for the USER's browser to visit. This process never requests it.
const USER_DATA_ROOT = expand(typeof B.userDataDir === "string" ? B.userDataDir : "~/.attention-hub/browser-data");
const DATA_DIR = expand(typeof config.dataDir === "string" ? config.dataDir : "data");

/** The browsers this machine may have, keyed by the name a profile's `browser` field uses.
 * Chrome and Chromium are the same engine, so one mechanism covers both, and adding a
 * browser is a config row rather than a code change. */
const BROWSERS = typeof B.browsers === "object" && B.browsers !== null ? B.browsers : {};

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Stated plainly rather than discovered late. The pane reads this off /health and explains
 * itself instead of opening a socket that can never work. */
const SUPPORTED_PLATFORMS = new Set(["darwin", "linux"]);
const PLATFORM_OK = SUPPORTED_PLATFORMS.has(process.platform);
const PLATFORM_WHY = PLATFORM_OK
  ? ""
  : `the browser pane runs on macOS and Linux, and this machine is ${process.platform}`;

// ------------------------------------------------------------------ finding a browser
//
// TWO STEPS, IN THIS ORDER, and the order is the lesson: a process started by launchd or by
// systemd gets a minimal PATH, so resolving a browser by NAME alone reports "not installed"
// on a machine that is running it. Explicit paths first, then PATH as the fallback that
// covers an install this list has never heard of (a Flatpak wrapper, /usr/local, a Nix
// profile). Both halves are config, so neither is a code change.
const binCache = new Map();

function isExecutableFile(candidate) {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function browserBin(name) {
  if (binCache.has(name)) return binCache.get(name);
  const entry = typeof BROWSERS[name] === "object" && BROWSERS[name] !== null ? BROWSERS[name] : {};
  let found = null;
  for (const candidate of Array.isArray(entry.bin) ? entry.bin : []) {
    if (typeof candidate === "string" && candidate.length > 0 && isExecutableFile(expand(candidate))) {
      found = expand(candidate);
      break;
    }
  }
  if (found === null) {
    const dirs = (process.env.PATH ?? "").split(path.delimiter).filter((d) => d.length > 0);
    outer: for (const commandName of Array.isArray(entry.names) ? entry.names : []) {
      for (const dir of dirs) {
        const full = path.join(dir, commandName);
        if (isExecutableFile(full)) {
          found = full;
          break outer;
        }
      }
    }
  }
  binCache.set(name, found);
  return found;
}

/** Which of the configured browsers are actually here. Reported on /health so the pane can
 * say "no browser is installed" instead of hanging on a socket that cannot open. */
const installedBrowsers = () => Object.fromEntries(Object.keys(BROWSERS).map((n) => [n, browserBin(n) !== null]));
const anyBrowser = () => Object.keys(BROWSERS).some((n) => browserBin(n) !== null);

const profileIndex = (id) => PROFILES.findIndex((p) => p?.id === id);
const profileAt = (id) => PROFILES[profileIndex(id)];
/** Which binary this profile runs in. Defaults to chrome so an ordinary row needs no field. */
const binFor = (id) => browserBin(profileAt(id)?.browser ?? "chrome");
/** THIS PROFILE'S PORT, read from config and never computed from list position. The derived
 * version (base + index) meant reordering the profiles silently repointed every profile at a
 * different browser: measured live upstream, a row labelled one account attached to the
 * browser of another and showed its tabs. A port is an identity, so it is written down. */
const debugPort = (id) => Number(profileAt(id)?.port ?? 0);
const dataDirFor = (id) => path.join(USER_DATA_ROOT, id);
const seeded = (id) => existsSync(path.join(dataDirFor(id), "Default"));

// ------------------------------------------------------------------ browser lifecycle

/** Is a browser already listening for this profile? Cheap, and the reason a second pane on
 * the same profile joins the browser that is already open instead of racing a new one. */
async function browserAlive(id, timeoutMs = 1000) {
  try {
    // hub-allow-network: loopback only, to this profile's own debugging port on this machine.
    const res = await fetch(`http://127.0.0.1:${debugPort(id)}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** One in-flight launch per profile. Without it, four panes restoring at once would each
 * spawn a browser against the same data dir; the singleton lock means the extra three hand
 * off and exit, and the pane that spawned one would sit waiting on a port its own dead child
 * was supposed to open. */
const launching = new Map();

async function ensureBrowser(id) {
  if (!PLATFORM_OK) throw new Error(PLATFORM_WHY);
  const which = profileAt(id)?.browser ?? "chrome";
  const bin = binFor(id);
  if (bin === null) {
    throw new Error(
      `${which} is not installed at any path in browser.browsers.${which}.bin, and none of browser.browsers.${which}.names is on PATH`,
    );
  }
  if (debugPort(id) === 0) throw new Error(`${id} has no port in hub.config.json (browser.profiles)`);
  if (await browserAlive(id)) return;
  if (launching.has(id)) return launching.get(id);

  const job = (async () => {
    const dir = dataDirFor(id);
    if (!seeded(id)) {
      // FAIL HERE, LOUDLY, rather than letting the browser create an empty profile. A blank
      // browser would look like it worked and then be signed into nothing, which is a far
      // more confusing failure than being told the seed has not run.
      throw new Error(
        `${id} has no browser yet at ${dir}. Quit ${which} completely, then run: node scripts/seed-browser-profile.mjs ${id}`,
      );
    }
    mkdirSync(dir, { recursive: true });
    const args = [
      `--user-data-dir=${dir}`,
      `--remote-debugging-port=${debugPort(id)}`,
      // Loopback only, matching rule 1. Chromium binds the debugging port to localhost by
      // default; saying so explicitly means a future flag change cannot widen it silently.
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      // Never fight the user's real browser over the default-browser prompt, and never
      // restore a crashed session's tabs into a pane nobody asked for.
      "--disable-session-crashed-bubble",
      "--hide-crash-restore-bubble",
      // Size is honoured. POSITION IS NOT on macOS (it clamps a launching window onto a
      // display: asking for -3200,0 measurably produced 0,61). The window gets parked after
      // it is up, by setWindow() below, which is the only thing that works.
      `--window-size=${WIN_SIZE[0]},${WIN_SIZE[1]}`,
      // THE THREE ANTI-THROTTLE FLAGS. A window parked off the desktop is "occluded" as far
      // as the OS is concerned, and an occluded Chromium throttles rendering to near zero,
      // which shows up as a pane that only updates when you touch it. Measured with these
      // flags on: 92.8 fps off-screen, identical to headless.
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion",
      HOME_URL,
    ];
    // DETACHED and fully unparented. This browser must outlive the sidecar: a sidecar restart
    // should cost a reconnect, never the user's open tabs. Argument array, never a shell
    // string, so a path with a space is not a code path.
    const child = spawn(bin, args, { detached: true, stdio: "ignore" });
    child.unref();

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await browserAlive(id, 500)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${which} for ${id} did not open its debugging port within 20s`);
  })().finally(() => launching.delete(id));

  launching.set(id, job);
  return job;
}

// ------------------------------------------------------------------ a CDP connection

/** A minimal CDP client: request and response by id, plus events. Deliberately not a
 * browser-automation framework. This needs three domains and a socket, and puppeteer here
 * would be a second, much larger dependency doing the same job. */
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url, { perMessageDeflate: false }); // hub-allow-network: the loopback CDP socket of a browser on this machine.
    this.next = 0;
    this.pending = new Map();
    this.handlers = new Set();
    this.ready = new Promise((res, rej) => {
      this.ws.once("open", res);
      this.ws.once("error", rej);
    });
    this.ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message ?? "cdp error"));
        else res(msg.result ?? {});
        return;
      }
      if (msg.method !== undefined) for (const h of this.handlers) h(msg);
    });
  }

  on(handler) {
    this.handlers.add(handler);
  }

  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((res, rej) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        rej(new Error("cdp socket closed"));
        return;
      }
      // The method rides in the rejection. Without it a failure reads as a bare
      // "Not attached to an active page" with no way to tell WHICH call produced it, which is
      // exactly how long that one took to find the first time.
      this.pending.set(id, { res, rej: (e) => rej(new Error(`${method}: ${e.message}`)) });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already gone
    }
  }
}

/** Move a window out of the way, or bring it back. NEVER minimize: a minimized window stops
 * compositing and the mirror drops to 0.3 fps, which looks exactly like a broken socket.
 * macOS clamps the result (a far-negative left lands around -1400, leaving a sliver at the
 * screen edge). That clamp is fine; pretending otherwise is what --window-position did. */
async function setWindow(cdp, targetId, park) {
  const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId });
  await cdp.send("Browser.setWindowBounds", {
    windowId,
    bounds: {
      left: park ? WIN_POS[0] : 80,
      top: park ? WIN_POS[1] : 80,
      width: WIN_SIZE[0],
      height: WIN_SIZE[1],
      windowState: "normal",
    },
  });
}

// ------------------------------------------------------- the browser-level connection
//
// THE PANE FOLLOWS THE AGENT, rather than the agent being bent to fit the pane. An AI
// session driving a browser through an extension works in its OWN tab group, and creating
// that group creates a NEW WINDOW to hold it. Measured 2026-07-29: that new window lands on
// the desktop no matter where its siblings are parked.
//
// So this connection exists to do two things, and they are what make "the agent's window IS
// the pane" true:
//   1. PARK EVERY NEW WINDOW the moment it appears. A window this process did not create can
//      still be moved (measured: it parks exactly like its own), so an agent's window never
//      reaches the desktop.
//   2. PUBLISH THE TAB LIST, so a pane can mirror the agent's tab instead of its own.
//
// One per profile, shared by every pane on it, reconnected if the browser restarts.
const browsers = new Map(); // profileId -> Cdp
/** Profiles whose window the user has deliberately RAISED. Auto-parking one of those would
 * yank the browser back off-screen the instant a site opened a popup, which is the opposite
 * of what the WINDOW button is for. */
const raised = new Set();
/** Live sockets, so a tab appearing can be pushed to the panes watching that profile. */
const clients = new Set(); // { profile, pane, send }

async function parkWindowOf(cdp, targetId) {
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId });
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { left: WIN_POS[0], top: WIN_POS[1], width: WIN_SIZE[0], height: WIN_SIZE[1], windowState: "normal" },
    });
  } catch {
    // a target that vanished between being created and reaching here is not worth a log line
  }
}

/** Every page tab in a profile, in the shape the pane's picker renders. devtools and
 * extension pages are excluded: they are real targets, and mirroring one is never what
 * anybody meant by "the agent's tab". */
async function tabsOf(id) {
  try {
    const cdp = await browserCdp(id);
    const { targetInfos } = await cdp.send("Target.getTargets");
    return targetInfos
      .filter((t) => t.type === "page" && !t.url.startsWith("devtools://") && !t.url.startsWith("chrome-extension://"))
      .map((t) => ({ id: t.targetId, title: t.title, url: t.url }));
  } catch {
    return [];
  }
}

/** The last list actually sent per profile, so an unchanged list is never re-sent.
 *
 * THIS IS NOT AN OPTIMISATION, IT IS THE FIX FOR A REAL BUG ("I cannot change tabs").
 * Target.targetInfoChanged fires on every title, favicon and load-state change, which
 * measured at THIRTEEN pushes in seven seconds across four tabs. Every push re-rendered the
 * pane's <select>, and a native dropdown closes when its element re-renders, so the list was
 * correct, the socket was correct, the switch worked when driven directly, and the menu still
 * slammed shut before a human could click an option. */
const lastTabs = new Map();

async function pushTabs(id) {
  const tabs = await tabsOf(id);
  // Compare on the fields the pane actually renders. A title flicking between "Example" and
  // "example.com - Search" IS a change worth sending; a favicon load is not.
  const fingerprint = JSON.stringify(tabs.map((t) => [t.id, t.title]));
  if (lastTabs.get(id) === fingerprint) return;
  lastTabs.set(id, fingerprint);
  for (const c of clients) if (c.profile === id) c.send({ type: "tabs", tabs });
}

async function browserCdp(id) {
  const existing = browsers.get(id);
  if (existing !== undefined && existing.ws.readyState === WebSocket.OPEN) return existing;
  // hub-allow-network: loopback only, the browser this hub launched on this machine.
  const ver = await (await fetch(`http://127.0.0.1:${debugPort(id)}/json/version`)).json();
  const cdp = new Cdp(ver.webSocketDebuggerUrl);
  await cdp.ready;
  cdp.on((msg) => {
    if (msg.method === "Target.targetCreated" && msg.params.targetInfo.type === "page") {
      // THE WHOLE POINT: park it before it can be seen. Skipped while the user has
      // deliberately raised this profile's browser, so a sign-in popup during a flow they are
      // watching does not get flung off-screen mid-way.
      if (!raised.has(id)) void parkWindowOf(cdp, msg.params.targetInfo.targetId);
      void pushTabs(id);
    } else if (msg.method === "Target.targetDestroyed" || msg.method === "Target.targetInfoChanged") {
      void pushTabs(id);
    }
  });
  // Discovery must come AFTER the handler is wired, or the burst of targetCreated events for
  // the tabs that already exist arrives with nobody listening.
  await cdp.send("Target.setDiscoverTargets", { discover: true });
  browsers.set(id, cdp);
  return cdp;
}

/** The tab a pane drives, keyed by profile and pane, so two panes on one profile are two
 * pages rather than two views fighting over one. The tab is found again on reconnect (a
 * reload must not litter tabs) and only created when missing. */
const paneTargets = new Map(); // `${profile}:${pane}` -> targetId

/** Connect to one specific tab. Split out from attachTab because switching the mirrored tab
 * mid-socket is an ordinary thing to do, not a reconnect. */
async function connectTo(id, targetId) {
  // hub-allow-network: loopback only, the debugging port of a browser on this machine.
  const list = await (await fetch(`http://127.0.0.1:${debugPort(id)}/json/list`)).json();
  const target = list.find((t) => t.id === targetId && t.type === "page");
  if (target === undefined) throw new Error("that tab is gone");
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  return { cdp, targetId };
}

/** Open a new tab in a profile's browser and return its target. */
async function newTab(id, url) {
  // hub-allow-network: loopback only, the debugging port of a browser on this machine.
  const created = await (
    await fetch(`http://127.0.0.1:${debugPort(id)}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
  ).json();
  return created;
}

async function attachTab(id, pane, url) {
  const key = `${id}:${pane}`;
  await browserCdp(id); // start parking and publishing before any tab exists
  // hub-allow-network: loopback only, the debugging port of a browser on this machine.
  const list = await (await fetch(`http://127.0.0.1:${debugPort(id)}/json/list`)).json();
  const pages = list.filter((t) => t.type === "page");

  let target = null;
  const remembered = paneTargets.get(key);
  if (remembered !== undefined) target = pages.find((t) => t.id === remembered) ?? null;
  // The first pane on a fresh browser adopts the window the browser already opened, rather
  // than creating a second tab and leaving an orphan on the home page.
  if (target === null && paneTargets.size === 0 && pages.length > 0) target = pages[0];
  if (target === null) target = await newTab(id, url);

  paneTargets.set(key, target.id);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  return { cdp, targetId: target.id };
}

// ------------------------------------------------------------------ token check

/** Burn a single-use token against the SAME SQLite the hub writes, so one database is the
 * source of truth for what was granted and restarting either side cannot desynchronise them.
 * better-sqlite3 is borrowed from the app's node_modules rather than installed a second
 * time, and ONE handle lives for the life of the process: a per-socket handle races the
 * hub's writer and turns SQLITE_BUSY into "only one pane will ever connect". */
let tokenDb = null;

async function openDb() {
  if (tokenDb !== null) return tokenDb;
  const { default: Database } = await import(
    path.join(appRoot, "node_modules", "better-sqlite3", "lib", "index.js")
  );
  tokenDb = new Database(path.join(DATA_DIR, "hub.db"));
  tokenDb.pragma("busy_timeout = 5000");
  return tokenDb;
}

async function burnToken(token) {
  if (typeof token !== "string" || token.length < 16) return null;
  const conn = await openDb();
  const row = conn
    .prepare("SELECT token, profile, pane, url, expires_at FROM browser_tokens WHERE token = ?")
    .get(token);
  if (row === undefined) return null;
  conn.prepare("DELETE FROM browser_tokens WHERE token = ?").run(token); // single use, burned even if expired
  if (Date.parse(`${row.expires_at}Z`) < Date.now()) return null;
  return { profile: row.profile, pane: row.pane ?? "", url: row.url ?? HOME_URL };
}

// ------------------------------------------------------------------ input translation

/** Modifier bits, as CDP wants them. */
const ALT = 1;
const CTRL = 2;
const META = 4;
const SHIFT = 8;

const modsOf = (m) => (m?.alt ? ALT : 0) | (m?.ctrl ? CTRL : 0) | (m?.meta ? META : 0) | (m?.shift ? SHIFT : 0);

/** Keys that must arrive as a real key event rather than inserted text: the page's own
 * handlers watch for them, and inserting "Enter" as a character would type nothing and
 * submit nothing. Everything printable goes through Input.insertText instead, which is the
 * only path that gets accents, emoji and IME composition right. */
const KEYCODES = {
  Enter: 13,
  Tab: 9,
  Backspace: 8,
  Delete: 46,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
};

/** The named keys that ALSO produce a character. Chrome needs the text ON the event or the
 * page never sees a return, and a search box typed into from here would never submit. */
const KEYTEXT = { Enter: "\r", Tab: "\t" };

// ------------------------------------------------------------------ the bridge

/** Accept the socket at "/" and at "/cdp". A reverse proxy in front of the hub may either
 * strip its path prefix or forward it verbatim, and accepting only one shape means the socket
 * silently never handshakes under the other, which a browser experiences as an eternal
 * "opening...". */
const strip = (url) => {
  const p = (url ?? "/").split("?")[0];
  return p.startsWith("/cdp") ? p.slice(4) || "/" : p;
};

/** Actions the hub can push to an open pane, so "follow that browser" is something an AI
 * session can do rather than a button a human has to go and find. Deliberately a tiny named
 * set and never a passthrough: this reaches a surface someone is looking at. */
const COMMANDS = new Set(["follow-on", "follow-off", "window", "park"]);

const server = createServer((req, res) => {
  const p = strip(req.url);
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (p === "/health") {
    // EVERYTHING THE PANE NEEDS TO EXPLAIN ITSELF, in one read. Honest degradation is the
    // whole reason this route carries more than {ok:true}: no browser installed, an
    // unsupported platform and an unseeded profile are three different sentences, and a pane
    // that cannot tell them apart can only hang.
    json(200, {
      ok: true,
      supported: PLATFORM_OK,
      why: PLATFORM_WHY,
      platform: process.platform,
      browser: anyBrowser(),
      browsers: installedBrowsers(),
      profiles: PROFILES.filter((x) => typeof x?.id === "string").map((x) => ({ id: x.id, seeded: seeded(x.id) })),
      port: PORT,
    });
    return;
  }
  // WHICH PANES ARE OPEN, AND ON WHICH PROFILE. This is what lets a session answer "which
  // browser am I looking at" without asking. The pane id says where the eyes are; the profile
  // says which browser is behind it. No URL and no title: this is not a browsing log.
  if (p === "/panes") {
    json(200, { ok: true, panes: [...clients].map((c) => ({ pane: c.pane, profile: c.profile })) });
    return;
  }
  // The hub POSTs here to reach the panes. Loopback only, the same rule the socket obeys.
  if (p === "/command" && req.method === "POST") {
    if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) {
      res.writeHead(403).end();
      return;
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 4096) req.destroy(); // a command is tiny; anything else is not one
    });
    req.on("end", () => {
      let msg = null;
      try {
        msg = JSON.parse(body);
      } catch {
        json(400, { ok: false, message: "body must be JSON" });
        return;
      }
      if (!COMMANDS.has(msg.action)) {
        json(400, { ok: false, message: `unknown action, one of ${[...COMMANDS].join(", ")}` });
        return;
      }
      // A profile narrows it to one browser's panes; omitted means every open pane.
      let sent = 0;
      for (const c of clients) {
        if (typeof msg.profile === "string" && msg.profile.length > 0 && c.profile !== msg.profile) continue;
        c.send({ type: "command", action: msg.action });
        sent += 1;
      }
      // HONEST ZERO. No open pane is the most likely reason a command appears to do nothing,
      // and it is not a failure of the command: there is nothing on the wall to receive it.
      json(200, {
        ok: sent > 0,
        sent,
        message: sent > 0 ? `${msg.action} reached ${sent} pane(s)` : "no browser pane is open to receive that",
      });
    });
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true }); // hub-allow-network: the loopback pane socket this sidecar serves.
server.on("upgrade", (req, socket, head) => {
  const p = strip(req.url);
  if (p !== "/" && p !== "/cdp") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", async (ws, req) => {
  const peer = req.socket.remoteAddress ?? "";
  if (!LOOPBACK.has(peer)) {
    console.warn(`[hub-browser] REFUSED ${peer}: not loopback`);
    ws.close(4003, "loopback only");
    return;
  }
  const url = new URL(req.url ?? "/cdp", `http://${HOST}:${PORT}`); // hub-no-request: parses the request path. Nothing is sent.

  let grant = null;
  try {
    grant = await burnToken(url.searchParams.get("token"));
  } catch (err) {
    console.error("[hub-browser] REFUSED: token check failed:", err);
    ws.close(4011, "token check failed");
    return;
  }
  if (grant === null) {
    console.warn("[hub-browser] REFUSED: no valid token (already burned, expired, or bogus)");
    ws.close(4001, "no valid token");
    return;
  }
  if (profileIndex(grant.profile) < 0) {
    ws.close(4004, `unknown profile ${grant.profile}`);
    return;
  }

  const say = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  // The viewport starts at the configured window size and is re-set the moment the pane
  // reports its own, so the page lays out for the PANE rather than for a 1440px window
  // squeezed into a quarter of a screen.
  let width = WIN_SIZE[0];
  let height = WIN_SIZE[1];
  /** The tab currently mirrored. MUTABLE, because following an agent means switching tabs is
   * an ordinary thing to do mid-socket, not a reconnect. */
  let cdp = null;
  let targetId = null;

  const startStream = async () => {
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: QUALITY,
      maxWidth: width,
      maxHeight: height,
    });
  };

  /** Tell the pane where it IS, whenever that changes. The address box is a MIRROR of the
   * real tab, never a box that merely remembers what was typed into it: a redirect, a login
   * bounce, a link click or an agent navigating must all show up there. */
  const reportUrl = async () => {
    try {
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: "JSON.stringify({u: location.href, t: document.title})",
        returnByValue: true,
      });
      const parsed = JSON.parse(result?.value ?? "{}");
      say({ type: "where", url: parsed.u ?? "", title: parsed.t ?? "" });
    } catch {
      // a navigation racing this read is not worth killing the socket over
    }
  };

  /** Point this pane at one tab: wire the frame pump, size the page to the pane, stream. */
  const mirror = async (nextCdp, nextTargetId) => {
    const old = cdp;
    cdp = nextCdp;
    targetId = nextTargetId;
    if (old !== null) {
      // Stop the OLD stream before the new one starts, or the browser keeps encoding JPEGs
      // for a tab nobody is watching for as long as this socket lives.
      old.send("Page.stopScreencast").catch(() => {});
      old.close();
    }
    cdp.on((msg) => {
      // A late frame from a tab already switched away from must not paint over the new one.
      if (cdp !== nextCdp) return;
      if (msg.method === "Page.screencastFrame") {
        // ACK ALWAYS, FORWARD SOMETIMES. Chrome will not produce the next frame until the
        // current one is acked, so acking immediately keeps the pipeline alive; dropping the
        // payload when the pane's socket is already backed up is what stops a slow link from
        // building an unbounded queue of stale frames. The result is an adaptive frame rate
        // rather than a growing delay.
        nextCdp.send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => {});
        if (ws.bufferedAmount > 2_000_000) return;
        say({ type: "frame", data: msg.params.data, meta: msg.params.metadata });
        return;
      }
      if (msg.method === "Page.frameNavigated" || msg.method === "Page.loadEventFired") void reportUrl();
    });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 0, // 0 = follow the host display, so text stays sharp on a retina
      mobile: false,
    });
    // ACTIVATE THE TAB BEING MIRRORED. In Chromium only the ACTIVE tab of a window is
    // rendered, so screencasting a background tab yields a live socket and a blank white
    // surface, which is exactly what a restored session of many tabs looks like when the pane
    // switches onto one of them. bringToFront makes it the active tab in its window (it does
    // NOT raise the window, which stays parked), so the compositor starts drawing.
    await cdp.send("Page.bringToFront").catch(() => {});
    // ORDER MATTERS, and getting it wrong is not a subtle failure: starting the screencast
    // immediately AFTER a navigate returns "Not attached to an active page", because the
    // navigation briefly detaches the page while it commits. Stream FIRST, then navigate,
    // which also means the first frames show the page being left rather than a blank pane.
    await startStream();
    say({ type: "attached", targetId });
    void reportUrl();
  };

  try {
    await ensureBrowser(grant.profile);
    const first = await attachTab(grant.profile, grant.pane, grant.url);
    await mirror(first.cdp, first.targetId);
    if (!raised.has(grant.profile)) await setWindow(cdp, targetId, true);
    if (grant.url.length > 0) await cdp.send("Page.navigate", { url: grant.url });
  } catch (err) {
    say({ type: "fatal", message: String(err instanceof Error ? err.message : err) });
    ws.close(4500, "could not attach");
    return;
  }

  const profile = profileAt(grant.profile);
  say({ type: "ready", profile: grant.profile, label: profile?.label ?? grant.profile, targetId });

  // Register for tab pushes, so a tab an agent opens appears in this pane's picker the moment
  // it exists rather than on the next poll.
  const client = { profile: grant.profile, pane: grant.pane, send: say };
  clients.add(client);
  // DIRECT, not through pushTabs: the dedupe there compares against the last list sent to the
  // PROFILE, so a pane joining a profile whose list has not changed since the previous pane
  // connected would receive nothing at all and sit on "(no tabs yet)" forever.
  void tabsOf(grant.profile).then((tabs) => say({ type: "tabs", tabs }));

  let idle = null;
  const touch = () => {
    if (idle !== null) clearTimeout(idle);
    idle = setTimeout(() => {
      // The SOCKET drops; the browser and every tab in it keep running. Rule 3 plus rule 4.
      say({ type: "idle" });
      ws.close(4008, "idle");
    }, IDLE_MS);
  };
  touch();

  ws.on("message", async (raw) => {
    touch();
    let m = null;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return; // a malformed frame is ignored, never forwarded to the browser
    }
    try {
      switch (m.type) {
        case "navigate":
          if (typeof m.url === "string" && m.url.length > 0) await cdp.send("Page.navigate", { url: m.url });
          break;
        case "tabs":
          // An explicit ask always answers, dedupe or not.
          say({ type: "tabs", tabs: await tabsOf(grant.profile) });
          break;
        case "newtab": {
          // A browser you cannot open a tab in is not a browser. Without this the pane could
          // only mirror tabs that already existed, and on a fresh profile the only one that
          // existed was the one it made itself, so there was nothing to switch between.
          const created = await newTab(
            grant.profile,
            typeof m.url === "string" && m.url.length > 0 ? m.url : HOME_URL,
          );
          if (typeof created?.id === "string") {
            const next = await connectTo(grant.profile, created.id);
            await mirror(next.cdp, next.targetId);
            paneTargets.set(`${grant.profile}:${grant.pane}`, next.targetId);
            say({ type: "tabs", tabs: await tabsOf(grant.profile) });
          }
          break;
        }
        case "attach": {
          // POINT THE PANE AT ANOTHER TAB, including one an AI session is driving. This is
          // what makes the agent's window the pane rather than a second window on the desk:
          // the agent works in its own tab group as it always does, the browser-level
          // connection parks that window the instant it appears, and this switches the
          // mirror onto it.
          if (typeof m.targetId !== "string" || m.targetId === targetId) break;
          const next = await connectTo(grant.profile, m.targetId);
          await mirror(next.cdp, next.targetId);
          paneTargets.set(`${grant.profile}:${grant.pane}`, next.targetId);
          break;
        }
        case "back":
        case "forward": {
          const hist = await cdp.send("Page.getNavigationHistory");
          const want = hist.currentIndex + (m.type === "back" ? -1 : 1);
          const entry = hist.entries?.[want];
          if (entry !== undefined) await cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id });
          break;
        }
        case "reload":
          await cdp.send("Page.reload");
          break;
        case "mouse":
          await cdp.send("Input.dispatchMouseEvent", {
            type: m.event, // mousePressed | mouseReleased | mouseMoved
            x: m.x,
            y: m.y,
            button: m.button ?? "left",
            buttons: m.buttons ?? 0,
            clickCount: m.clickCount ?? 1,
            modifiers: modsOf(m.mods),
          });
          break;
        case "wheel":
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseWheel",
            x: m.x,
            y: m.y,
            deltaX: m.deltaX ?? 0,
            deltaY: m.deltaY ?? 0,
            modifiers: modsOf(m.mods),
          });
          break;
        case "text":
          // Printable input, including anything an IME composed. insertText is the only path
          // that gets accents and emoji right; a synthesised keypress per character does not.
          if (typeof m.text === "string" && m.text.length > 0) await cdp.send("Input.insertText", { text: m.text });
          break;
        case "key": {
          const code = KEYCODES[m.key];
          if (code === undefined) break; // printable keys arrive as "text", never here
          const base = {
            key: m.key,
            code: m.key,
            windowsVirtualKeyCode: code,
            nativeVirtualKeyCode: code,
            modifiers: modsOf(m.mods),
          };
          // ENTER AND TAB CARRY TEXT, and that is the whole difference between a search box
          // that submits and one that just sits there. A key with a text equivalent must be
          // dispatched as `keyDown` WITH that text: "rawKeyDown" is explicitly the variant
          // that generates no character, so a form never sees the return. Measured:
          // rawKeyDown plus insertText("\r") typed nothing and submitted nothing.
          const text = KEYTEXT[m.key];
          await cdp.send(
            "Input.dispatchKeyEvent",
            text === undefined ? { ...base, type: "rawKeyDown" } : { ...base, type: "keyDown", text },
          );
          await cdp.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
          break;
        }
        case "resize": {
          if (!Number.isFinite(m.width) || !Number.isFinite(m.height)) break;
          width = Math.max(200, Math.min(4000, Math.round(m.width)));
          height = Math.max(200, Math.min(4000, Math.round(m.height)));
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width,
            height,
            deviceScaleFactor: 0,
            mobile: false,
          });
          // The stream is capped at the size it was STARTED with, so a pane that grows would
          // otherwise keep streaming the old, smaller picture upscaled and soft.
          await cdp.send("Page.stopScreencast").catch(() => {});
          await startStream();
          break;
        }
        case "window": {
          // PULL THE REAL WINDOW FORWARD, or park it again. This is the whole reason the
          // browser is headful rather than headless: an extension's popup, a download prompt,
          // a file picker and a print dialog are the browser's own UI, and a screencast only
          // ever carries page pixels. Showing the window is how a human reaches them, and it
          // is always a deliberate act, never automatic.
          const show = m.show === true;
          // Remember the choice at the PROFILE level: while this browser is raised, the
          // auto-parker must leave its windows alone.
          if (show) raised.add(grant.profile);
          else raised.delete(grant.profile);
          await setWindow(cdp, targetId, !show);
          // setWindowBounds POSITIONS but does not RAISE, and a window placed under the hub is
          // indistinguishable from one that never moved.
          if (show) await cdp.send("Page.bringToFront").catch(() => {});
          say({ type: "window", shown: show });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      say({ type: "note", message: String(err instanceof Error ? err.message : err) });
    }
  });

  ws.on("close", () => {
    if (idle !== null) clearTimeout(idle);
    clients.delete(client);
    // DETACH, NEVER KILL (rule 4). Stop the stream so the browser is not encoding JPEGs for
    // nobody, drop the CDP socket, and leave the browser and every tab exactly as they are.
    // The browser-level connection deliberately STAYS: it is what keeps parking windows an
    // agent opens, and it belongs to the profile rather than to this pane.
    cdp.send("Page.stopScreencast").catch(() => {});
    cdp.close();
  });
});

server.listen(PORT, HOST, () => {
  const state = PLATFORM_OK
    ? `browsers ${Object.entries(installedBrowsers())
        .map(([n, ok]) => `${n}:${ok ? "ok" : "MISSING"}`)
        .join(" ") || "none configured"}`
    : `UNSUPPORTED: ${PLATFORM_WHY}`;
  const names = PROFILES.map((p) => p?.id).filter((id) => typeof id === "string");
  console.log(
    `[hub-browser] sidecar on ws://${HOST}:${PORT}/cdp . ${state} . profiles: ${names.join(", ") || "none"}`, // hub-no-request: prints the local address it is listening on.
  );
});
