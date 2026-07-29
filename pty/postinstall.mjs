#!/usr/bin/env node
// THE CHMOD THAT MAKES THE TERMINAL WORK ON SOMEBODY ELSE'S MACHINE.
//
// node-pty ships a small helper binary called spawn-helper, and its prebuild
// installs it WITHOUT the executable bit. The package installs clean, the
// require succeeds, and the first attempt to open a shell dies with
// "posix_spawnp failed". Nothing in the failure mentions a file mode.
//
// So this runs on every install of this package, including every npm ci, which
// is the point: a one-off manual chmod is undone by the next install and the
// terminal breaks again weeks later with no obvious cause. It lives in the
// SIDECAR's package rather than the app's for the same reason the dependency
// does: the app must never install node-pty at all.
//
// It never fails the install. A missing helper is normal on a platform that does
// not use one, and a sidecar that cannot start says so loudly at start time,
// where the message can be read.
import { chmodSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "node_modules", "node-pty");
const NAME = "spawn-helper";
/** rwxr-xr-x. Executable by you, readable by the system, writable by nobody else. */
const MODE = 0o755;

/** Every spawn-helper under node-pty, wherever the prebuild put it (build/Release
 * today, prebuilds/ on some platforms). Names, not paths, so a layout change
 * upstream does not silently stop the fix from applying. */
function findHelpers(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findHelpers(full, found);
    else if (entry.name === NAME) found.push(full);
  }
  return found;
}

if (process.platform === "win32") {
  console.log("[pty] Windows: nothing to chmod. The terminal module is macOS and Linux only.");
  process.exit(0);
}

const helpers = findHelpers(root);
if (helpers.length === 0) {
  console.log(`[pty] no ${NAME} found under node_modules/node-pty. Nothing to fix.`);
  process.exit(0);
}

for (const helper of helpers) {
  try {
    const before = statSync(helper).mode & 0o777;
    chmodSync(helper, MODE);
    const after = statSync(helper).mode & 0o777;
    const changed = before === after ? "already executable" : `was ${before.toString(8)}, now ${after.toString(8)}`;
    console.log(`[pty] ${path.relative(here, helper)}: ${changed}`);
  } catch (err) {
    // Loud, and still not fatal: the install completing is worth more than this
    // script's exit code, and the sidecar reports the real failure at start time.
    console.warn(`[pty] could not chmod ${helper}: ${err.message}`);
    console.warn("[pty] The first shell will fail with posix_spawnp. Run: chmod +x " + helper);
  }
}
