#!/usr/bin/env node
// Start the Attention Hub. Usage: node scripts/serve.mjs [start|dev]
//
// PRODUCTION IS THE DEFAULT. `start` builds if it has to, then serves the built
// app; `dev` is the contributor mode and you have to ask for it. That is a
// deliberate flip from the first draft, for four reasons that all land on the
// same person: this thing runs all day on someone's laptop. Dev mode compiles
// routes on first request (a slow first paint after every restart), runs a file
// watcher forever (battery, CPU, worse on Windows once the user directory has
// real content in it), re-evaluates server modules on every reload, and, worst
// of all, the cross-origin dev block that next.config.ts documents at length
// exists ONLY in dev, so the "page renders and every click is dead" failure
// belongs to dev alone. Shipping users into dev mode opts them into all four.
//
// Two more properties this script exists to guarantee:
//
//   LOCAL BY DEFAULT. The bind host comes from hub.config.json and ships as
//   127.0.0.1. It never falls open to 0.0.0.0, and nothing here shells out to
//   another tool to discover a network address. Reaching the hub from
//   elsewhere is a decision you make in your config, not a default we made
//   for you.
//
//   YOUR VALUE OR AN ERROR, NEVER A SUBSTITUTE. If you write "port": "3000"
//   (a string, the single most common JSON config mistake), this refuses and
//   says so. It does NOT quietly bind the default and print an address you did
//   not ask for while the app's own loader rejects the same file: that split
//   verdict left the user browsing to a port nothing was listening on, with no
//   error anywhere. The message vocabulary here is deliberately identical to
//   src/lib/config.ts, and the defaults below are asserted equal to
//   hub.config.example.json by .githooks/release-check.sh.
//
// This script is deliberately dependency free: it reads the JSON config itself
// rather than importing the TypeScript loader. It validates the keys IT uses;
// everything else is the loader's business, and a bad value there surfaces as
// the config-problem card on a hub you can actually reach.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { appRoot, runNext } from "./next-run.mjs";

// ---------------------------------------------------------------- node floor
//
// REFUSE, DO NOT SEGFAULT. better-sqlite3 is a native module with a hard Node
// floor, and below it the failure is not a polite error: the process takes a
// SIGSEGV on the first request that touches the database. That crash lands
// AFTER "Ready" prints, so the last line in the log is a success line, and a
// supervisor with KeepAlive respawns it forever while every request is
// refused. This is the same rule the header states as YOUR VALUE OR AN ERROR,
// NEVER A SUBSTITUTE, applied to the runtime instead of the config.
//
// The floor is READ FROM package.json, never written here, so this check and
// the manifest cannot drift apart. Dependency free, like the rest of this file:
// a two-line parse beats pulling in semver to read one integer.

/** The major from an engines range like ">=22" or ">=22.1.0". Null if unreadable. */
function requiredNodeMajor() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
    const range = pkg?.engines?.node;
    if (typeof range !== "string") return null;
    const match = range.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

const floor = requiredNodeMajor();
const running = Number(process.versions.node.split(".")[0]);
if (floor !== null && running < floor) {
  console.error(
    `[hub] Node ${process.versions.node} is too old: this hub needs Node ${floor} or newer, because better-sqlite3 does.`,
  );
  console.error("[hub] Below that floor it does not fail politely, it crashes the process on the");
  console.error("[hub] first request that touches the database, after the ready line has printed.");
  console.error(`[hub] Fix: switch to Node ${floor} or newer, then run: npm rebuild better-sqlite3`);
  console.error("[hub] The rebuild is not optional. The installed binary was compiled against the old one.");
  process.exit(1);
}

// Defaults first: the hub starts and runs before anyone has written a config.
// Kept in step with src/lib/config.ts and hub.config.example.json by the
// release check, which fails if the three disagree.
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 2886; // check-paths-allow: the documented default, asserted equal to hub.config.example.json by release-check.sh

const CONFIG_FILE = "hub.config.json";
const CONFIG_EXAMPLE_FILE = "hub.config.example.json";

/** The same sentence src/lib/config.ts produces, naming the file actually read. */
function configError(file, where, expected) {
  console.error(`[hub] ${file}: expected ${expected} at "${where}"`);
  console.error("[hub] Fix that key, or remove it to fall back to the documented default.");
  process.exit(1);
}

/** Returns { file, root }. A missing config is not an error: the defaults apply. */
function readConfig() {
  for (const file of [CONFIG_FILE, CONFIG_EXAMPLE_FILE]) {
    const full = path.join(appRoot, file);
    if (!existsSync(full)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, "utf8"));
    } catch (err) {
      console.error(`[hub] ${file} is not valid JSON: ${err.message}`);
      console.error("[hub] Fix the file, or delete it to fall back to defaults.");
      process.exit(1);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      configError(file, "(root)", "an object");
    }
    return { file, root: parsed };
  }
  return { file: CONFIG_FILE, root: {} };
}

const { file: configFile, root: config } = readConfig();

const bindRaw = config["bind"];
if (bindRaw !== undefined && bindRaw !== null && (typeof bindRaw !== "object" || Array.isArray(bindRaw))) {
  configError(configFile, "bind", "an object");
}
const bind = typeof bindRaw === "object" && bindRaw !== null ? bindRaw : {};

const hostRaw = bind["host"];
if (hostRaw !== undefined && hostRaw !== null && (typeof hostRaw !== "string" || hostRaw.trim() === "")) {
  configError(configFile, "bind.host", "a non-empty string");
}
const host = typeof hostRaw === "string" ? hostRaw : DEFAULT_HOST;

const portRaw = bind["port"];
if (portRaw !== undefined && portRaw !== null && !Number.isInteger(portRaw)) {
  configError(configFile, "bind.port", "a whole number");
}
const port = Number.isInteger(portRaw) ? portRaw : DEFAULT_PORT;
if (port < 1 || port > 65535) {
  configError(configFile, "bind.port", "a number between 1 and 65535");
}

if (host === "0.0.0.0" || host === "::") {
  console.warn("[hub] WARNING: bind.host exposes the hub to every network this machine is on.");
  console.warn("[hub] The hub has no login. Put a private network in front of it instead.");
}

const requested = process.argv[2] ?? "start";
if (requested !== "start" && requested !== "dev") {
  console.error(`[hub] unknown mode "${requested}". Use: start (production, the default) or dev.`);
  process.exit(1);
}
const mode = requested;

const shown = host === "0.0.0.0" || host === "::" ? DEFAULT_HOST : host;
console.log(`[hub] ${mode} on http://${shown}:${port}`); // hub-no-request: prints the local address, nothing is sent
if (host === DEFAULT_HOST) console.log("[hub] Local only: nothing else on your network can reach this.");
if (mode === "dev") {
  console.log("[hub] Development mode: slower, and it watches your files. Plain ./start.sh runs production.");
}

/** The newest mtime under a path, or 0 if it is not there. Depth-limited only
 * by the tree itself, and it never follows into `node_modules` or `.next`. */
function newestMtime(target) {
  let newest = 0;
  const walk = (p) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      const base = path.basename(p);
      if (base === "node_modules" || base === ".next" || base === ".git") return;
      let entries;
      try {
        entries = readdirSync(p);
      } catch {
        return;
      }
      for (const entry of entries) walk(path.join(p, entry));
      return;
    }
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  };
  walk(target);
  return newest;
}

// Production needs something built, and it needs the build to match the SOURCE.
// Building on demand keeps the documented path one command, and it is the only
// place a run pauses.
//
// WHY THE STALENESS CHECK IS NOT OPTIONAL. v1 updates are plain `git pull`, and
// production is the default run mode. Checking only whether a build EXISTS meant
// a user could pull a release, restart, and be served the OLD app forever, with
// every new room returning 404 while the docs said it was there. That happened
// here during the v1 build: three merged slices, a 13-hour-old build, and
// `/wall` and `/browser` both 404 on a tree that had just passed every gate.
// A stale build is BROKEN, not empty, so it says so and fixes itself.
if (mode === "start") {
  const buildId = path.join(appRoot, ".next", "BUILD_ID");
  const builtAt = existsSync(buildId) ? statSync(buildId).mtimeMs : 0;
  // Everything that changes what a build produces. Runtime config is absent on
  // purpose: hub.config.json is read at request time, so editing it must NOT
  // trigger a rebuild.
  const sourceAt = Math.max(
    newestMtime(path.join(appRoot, "src")),
    newestMtime(path.join(appRoot, "package.json")),
    newestMtime(path.join(appRoot, "next.config.ts")),
    newestMtime(path.join(appRoot, "tsconfig.json")),
  );

  if (builtAt === 0) {
    console.log("[hub] No production build yet, building it once (this takes a minute)...");
  } else if (sourceAt > builtAt) {
    console.log("[hub] The code is newer than the last build, so this one is stale.");
    console.log("[hub] Rebuilding before serving, or you would get the old hub back.");
  }

  if (builtAt === 0 || sourceAt > builtAt) {
    const built = await runNext(["build"]);
    if (built !== 0) {
      console.error("[hub] The build failed, so there is nothing to serve.");
      console.error("[hub] Fix the error above, or run ./start.sh dev while you work.");
      process.exit(built);
    }
  }
}

process.exit(await runNext([mode, "-H", host, "-p", String(port)]));
