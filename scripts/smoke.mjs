#!/usr/bin/env node
// THE SMOKE WALKTHROUGH - the gate that asks "does it actually render", which is the one
// question typecheck cannot answer.
//
// WHY IT EXISTS, with the receipt. On 2026-07-31 three separate features in the build this
// hub came from were completely dead - a component was never mounted in one display mode, a
// service worker was registered only from a button that mode never renders, and the control
// that turns the whole feature on lived in that same hidden bar. `tsc --noEmit` was clean,
// the production build was clean, 207 unit tests passed, and every one of those three
// features did nothing. Only driving a real browser found it.
//
// The unit tests here are excellent at pure logic and structurally incapable of catching that
// class: nothing in `test/` renders a page. This is the other half.
//
// DEPENDENCY FREE, on purpose, like everything else in `scripts/`. It drives headless Chrome
// over the DevTools protocol using Node's built-in WebSocket. No Playwright, no Puppeteer, no
// browser download: it uses the Chrome you already have, and says so plainly when you do not.
//
// WHAT IT ASSERTS, and every rule here is one the failure above taught:
//   1. THE PAGE RENDERED, not merely that the server answered 200. A React error boundary,
//      a hydration failure and a blank body all return 200.
//   2. THE LOAD-BEARING ELEMENTS EXIST, per route, from smoke.json. If a selector stops
//      matching, either the UI changed or something stopped mounting - both are worth a stop.
//   3. NO CONSOLE ERRORS. This is the cheap one that catches the most, because a component
//      that throws during mount logs and then renders nothing.
//   4. EVERY DISPLAY MODE, where the app has them. The whole reason last time's bugs hid is
//      that one mode renders chrome another does not, and only one was ever looked at.
//
// IT DOES NOT START THE HUB. Ambiguity about which build you just tested is worse than an
// extra command, and this way it works against dev, against a production build, and against
// a hub you already have open. It fails loudly and tells you what to run.
//
// Usage:  node scripts/smoke.mjs [--url <where the hub is>] [--plan <file>] [--keep-open]
//         With no --url it reads bind.host and bind.port from hub.config.json, like everything else here.
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Where Chrome lives, per platform, in the order we would rather have it. Feature-detected
 * rather than assumed: a missing browser is a clear message, never a stack trace. */
const CHROME_CANDIDATES = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

function findChrome() {
  const fromEnv = process.env.SMOKE_CHROME;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  for (const c of CHROME_CANDIDATES[process.platform] ?? []) if (existsSync(c)) return c;
  return null;
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

function loadPlan() {
  // --plan exists so this gate can be PROVEN to fail. A check nobody has ever seen go red is
  // a check nobody should trust, and the only honest way to demonstrate one is to point it at
  // a plan you know is wrong and watch it refuse.
  const p = arg("--plan") ?? path.join(appRoot, "smoke.json");
  if (!existsSync(p)) {
    console.error("smoke: no smoke.json beside package.json. That file IS the walkthrough.");
    process.exit(2);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function defaultUrl() {
  // NO FALLBACK PORT, deliberately. If the config cannot be read, guessing means the
  // walkthrough might quietly pass against something that is not this hub, and a gate that
  // green-lights the wrong target is worse than one that refuses.
  //
  try {
    const cfg = JSON.parse(readFileSync(path.join(appRoot, "hub.config.json"), "utf8"));
    return `http://${cfg.bind.host}:${cfg.bind.port}`; // hub-no-request: builds a string, sends nothing
  } catch (e) {
    console.error(`smoke: cannot read hub.config.json (${e.message}). Pass --url explicitly.`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------------------
// A very small CDP client. Only what this needs, so there is nothing here to keep up to date.

async function cdp(port) {
  // Chrome takes a moment to open the port. Poll rather than sleep a guessed amount: a fixed
  // sleep is either slower than it needs to be or flaky on a loaded machine, and flaky is the
  // one thing a gate may never be.
  let version = null;
  for (let i = 0; i < 100; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); // hub-allow-network: loopback to the headless browser this script just spawned
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (version === null) throw new Error("Chrome never opened its debugging port");

  const ws = new WebSocket(version.webSocketDebuggerUrl); // hub-allow-network: loopback DevTools socket of our own spawned browser
  const pending = new Map();
  const listeners = [];
  let id = 0;
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("could not attach to Chrome"));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id !== undefined && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.error.message));
      else res(m.result);
      return;
    }
    for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const msgId = (id += 1);
      pending.set(msgId, { res, rej });
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send, on: (fn) => listeners.push(fn), close: () => ws.close() };
}

// ---------------------------------------------------------------------------------------

/** Console errors we refuse to fail on, with the reason each is genuinely not our bug.
 * KEEP THIS LIST SHORT AND ARGUED. Every entry is a hole in the gate, so an entry without a
 * reason beside it is a bug someone silenced. */
const IGNORE = [
  // A dev build streams its own HMR socket; it drops on teardown and logs. Not the app.
  /websocket.*closed|Failed to load resource.*_next\/static\/webpack/i,
  // favicon is not a feature.
  /favicon\.ico/i,
];

async function walk(page, { url, routes, modes, storageKey }) {
  const failures = [];
  for (const mode of modes.length > 0 ? modes : [null]) {
    for (const route of routes) {
      const label = mode === null ? route.path : `${route.path} [${mode}]`;
      const errors = [];
      const offConsole = (m) => {
        if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
          const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
          if (!IGNORE.some((re) => re.test(text))) errors.push(text.slice(0, 200));
        }
        if (m.method === "Runtime.exceptionThrown") {
          const d = m.params.exceptionDetails;
          const text = d.exception?.description ?? d.text ?? "exception";
          if (!IGNORE.some((re) => re.test(text))) errors.push(text.slice(0, 200));
        }
      };
      page.on(offConsole);

      // The display mode is a stored preference, so it has to be set BEFORE the app boots or
      // we would be testing the default every time and calling it four passes.
      //
      // `probe` rides the same injection, and it is the piece that makes this gate able to
      // check the thing that actually broke. A HEADLESS component renders no element, so no
      // selector can prove it mounted; what it does is call something. Spy on that call here,
      // assert it below, and "is this feature wired up in this mode" becomes a real check
      // rather than a hope. Every dead feature found on 2026-07-31 was headless or lived in
      // chrome one mode does not render, and this is the half that would have caught them.
      const pre = [];
      if (mode !== null && storageKey) {
        pre.push(`try{localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(mode)})}catch(e){}`);
      }
      if (route.probe) pre.push(route.probe);
      // REMOVE THE PREVIOUS ONE. addScriptToEvaluateOnNewDocument ACCUMULATES: without the
      // matching remove, route 2 runs the probe twice, route 3 three times, and a probe that
      // declares anything dies on "Identifier already declared" - which then shows up as a
      // console error on every route and buries the real result. Caught by this gate failing
      // on its own first run, which is a reasonable way to find out.
      let injected = null;
      if (pre.length > 0) {
        // Wrapped so a probe can declare freely without reaching global scope at all.
        const r = await page.send("Page.addScriptToEvaluateOnNewDocument", {
          source: `(()=>{${pre.join("\n")}})()`,
        });
        injected = r.identifier;
      }
      await page.send("Page.navigate", { url: url + route.path });
      // Wait for the app to settle rather than for a fixed time: React mounts after load.
      await new Promise((r) => setTimeout(r, route.settleMs ?? 2500));

      const found = await page.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          bodyLen: (document.body.innerText || "").trim().length,
          missing: ${JSON.stringify(route.expect ?? [])}.filter(s => document.querySelector(s) === null),
        })`,
        returnByValue: true,
      });
      const { bodyLen, missing } = JSON.parse(found.result.value);

      const before = failures.length;

      // Effect assertions run AFTER settle, against whatever the probe recorded.
      for (const a of route.assert ?? []) {
        let ok = false;
        let detail = "";
        try {
          const r = await page.send("Runtime.evaluate", { expression: `!!(${a.expr})`, returnByValue: true });
          ok = r.result.value === true;
        } catch (e) {
          detail = ` (${e.message})`;
        }
        if (!ok) failures.push(`${label}: ${a.why ?? a.expr}${detail}`);
      }

      const floor = route.minText ?? 20;
      if (bodyLen < floor) failures.push(`${label}: rendered only ${bodyLen} chars of text, expected at least ${floor}`);
      for (const sel of missing) failures.push(`${label}: expected element not found: ${sel}`);
      for (const e of errors) failures.push(`${label}: console error: ${e}`);

      page.off(offConsole);
      if (injected !== null) {
        await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injected });
      }
      // PER-ROUTE, not cumulative. Comparing against the running total marked every route
      // after the first failure as failed too, which buries which one actually broke.
      console.log(`  ${failures.length === before ? "ok  " : "FAIL"} ${label}`);
    }
  }
  return failures;
}

async function main() {
  const plan = loadPlan();
  const url = (arg("--url") ?? defaultUrl()).replace(/\/$/, "");

  // THE NO-TELEMETRY RULE APPLIES TO THE TOOLS TOO. --url is the one value here a person
  // could point anywhere, so it is checked rather than trusted: this drives a browser and
  // reports what it sees, and a dev tool that will happily do that against someone else's
  // host is a different and much worse thing than a smoke test. Loopback only, and the
  // override has to be typed on purpose.
  const host = new URL(url).hostname;
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  if (!loopback && process.env.SMOKE_ALLOW_REMOTE !== "1") {
    console.error(`smoke: ${host} is not loopback. This hub makes no outbound calls, and neither do its tools.`);
    console.error("       If you really mean to walk a remote hub you own, set SMOKE_ALLOW_REMOTE=1.");
    process.exit(2);
  }

  const chrome = findChrome();
  if (chrome === null) {
    console.error("smoke: no Chrome, Chromium or Brave found. Set SMOKE_CHROME to a browser binary.");
    process.exit(2);
  }

  // A hub that is not running is the most likely reason to be here, so say it in one line
  // instead of failing later inside the browser with something unreadable.
  try {
    const res = await fetch(url, { redirect: "manual" }); // hub-allow-network: the hub under test, asserted loopback above
    if (res.status >= 500) throw new Error(`hub answered ${res.status}`);
  } catch (e) {
    console.error(`smoke: nothing healthy at ${url} (${e.message}).`);
    console.error("       start the hub first (npm run dev, or npm start), or pass --url.");
    process.exit(2);
  }

  // The throwaway BROWSER's debug port, derived from the pid so two smoke runs cannot
  // collide. Nothing serves on it.
  const port = 9400 + Math.floor(process.pid % 200); // check-paths-allow: browser debug port, not a hub port
  const profile = path.join(os.tmpdir(), `hub-smoke-${process.pid}`);
  const proc = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--window-size=1440,900",
    ],
    { stdio: "ignore" },
  );

  let client = null;
  let failures = [];
  try {
    client = await cdp(port);
    const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
    // ONE client listener for the whole run, fanning out to whoever is currently subscribed.
    // Registering a new client listener inside `on` (the obvious shape) means route N gets N
    // copies of every console event, so a single error is reported five times and the count
    // in the summary is fiction. Found by reading this back rather than by it failing, which
    // is exactly the kind of thing a gate must not have.
    const page = {
      listeners: [],
      send: (m, p) => client.send(m, p, sessionId),
      on: (fn) => page.listeners.push(fn),
      off: (fn) => {
        const i = page.listeners.indexOf(fn);
        if (i > -1) page.listeners.splice(i, 1);
      },
    };
    client.on((msg) => {
      if (msg.sessionId === sessionId) for (const l of [...page.listeners]) l(msg);
    });
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    console.log(`smoke: ${url}, ${plan.routes.length} route(s), ${Math.max(1, plan.modes?.length ?? 0)} mode(s)`);
    failures = await walk(page, {
      url,
      routes: plan.routes,
      modes: plan.modes ?? [],
      storageKey: plan.modeStorageKey ?? null,
    });
  } finally {
    client?.close();
    if (arg("--keep-open") === null) proc.kill();
  }

  console.log("");
  if (failures.length === 0) {
    console.log("smoke clean: every route rendered, every expected element present, no console errors.");
    process.exit(0);
  }
  console.error(`SMOKE FAILED: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`smoke: ${e.message}`);
  process.exit(2);
});
