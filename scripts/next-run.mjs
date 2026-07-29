#!/usr/bin/env node
// The ONE place Next.js is ever launched from. Nothing else in this repo may
// spawn `next`, and .githooks/release-check.sh asserts that no package.json
// script does.
//
// Why it is one place: the telemetry switch. Next.js phones home with anonymous
// usage stats on build AND on dev unless NEXT_TELEMETRY_DISABLED is set, and
// this product's headline promise is that it sends nothing. That promise held
// in the start scripts and broke in the one command the README told people to
// run (`next build`, bare, in package.json). A promise enforced in four places
// out of five is not enforced. So there is one boot path and one switch.
//
// Two more properties live here for the same reason:
//
//   WINDOWS WORKS. Spawning node_modules/.bin/next directly fails on Windows
//   (the bin entry is next.cmd), and reaching for shell:true to paper over that
//   opens a shell-injection surface. So we spawn this same node binary against
//   the resolved Next JS entry point, which sidesteps the shims entirely. It is
//   also why nothing here uses an inline PREFIX=value npm script: that is a
//   POSIX shell feature and Windows users are first class.
//
//   SIGNALS REACH THE CHILD. Ctrl+C in a terminal hits the whole foreground
//   group, so it looks fine. Killing the launcher by pid (a service wrapper, a
//   stop script, launchd, Task Scheduler) does not: without forwarding, the
//   next-server grandchild survives holding the port and the SQLite file, and
//   the next start fails with an EADDRINUSE nobody can explain.
//
// Dependency free on purpose: it reads nothing, imports nothing outside node:.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** The hub root. Every path in the boot scripts is relative to this, never absolute. */
export const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const require = createRequire(import.meta.url);

/** Next's own JS entry point, or null when it is not installed. */
export function resolveNext() {
  try {
    return require.resolve("next/dist/bin/next", { paths: [appRoot] });
  } catch {
    return null;
  }
}

function forwardSignals(child) {
  let relayed = false;
  const relay = (signal) => () => {
    if (relayed) return;
    relayed = true;
    if (child.pid === undefined) return;
    if (process.platform === "win32") {
      // taskkill without /T leaves the child's own children running, which is
      // exactly the orphan this function exists to prevent.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill(signal);
    }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, relay(signal));
  }
}

/**
 * Run one Next.js command to completion. Resolves with the exit code.
 * @param {string[]} args
 * @param {Record<string, string>} [extraEnv]
 * @returns {Promise<number>}
 */
export function runNext(args, extraEnv = {}) {
  const entry = resolveNext();
  if (entry === null) {
    console.error("[hub] Next.js is not installed. Run: npm install");
    process.exit(1);
  }

  const child = spawn(process.execPath, [entry, ...args], {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      // THE switch. See the header. Do not move this, do not duplicate it, and
      // do not let any other file spawn next without going through here.
      NEXT_TELEMETRY_DISABLED: "1",
      ...extraEnv,
    },
  });

  forwardSignals(child);

  return new Promise((resolve) => {
    child.on("error", (err) => {
      console.error(`[hub] could not start Next.js: ${err.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(signal !== null ? 1 : (code ?? 1)));
  });
}
