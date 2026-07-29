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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appRoot, runNext } from "./next-run.mjs";

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

// Production needs something built. Building on demand keeps the documented
// path one command, and it is the only place a first run pauses.
if (mode === "start" && !existsSync(path.join(appRoot, ".next", "BUILD_ID"))) {
  console.log("[hub] No production build yet, building it once (this takes a minute)...");
  const built = await runNext(["build"]);
  if (built !== 0) {
    console.error("[hub] The build failed, so there is nothing to serve.");
    console.error("[hub] Fix the error above, or run ./start.sh dev while you work.");
    process.exit(built);
  }
}

process.exit(await runNext([mode, "-H", host, "-p", String(port)]));
