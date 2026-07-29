#!/usr/bin/env node
// MAKE THE HUB'S BROWSER. Copies one of your real browser profiles into the hub's own data
// directory, once, so the browser pane has something signed in to mirror.
//
// Usage:
//   node scripts/seed-browser-profile.mjs              every configured profile
//   node scripts/seed-browser-profile.mjs work         just that one
//   RESEED=1 node scripts/seed-browser-profile.mjs work    overwrite an existing copy
//
// WHY A COPY AT ALL, which is the constraint the whole feature is built around. Since Chrome
// 136, --remote-debugging-port is IGNORED when the data directory is the default one
// (developer.chrome.com/blog/remote-debugging-port). That is deliberate hardening, not a bug:
// remote debugging can read cookies and passwords, so Chrome stopped letting it point at the
// profile you actually browse with. So the hub cannot drive the browser you have open, and
// never will be able to. It drives its own copy.
//
// WHAT SURVIVES THE COPY is reported rather than promised. This prints the size of the result
// and how many extensions came across, per profile, because whether a given extension or login
// survives a move is a fact about your machine and not something a script should assert. If a
// profile lands signed out, signing in once inside the hub's copy fixes it permanently: that
// copy is a real, persistent browser, not a scratch profile.
//
// ONE DATA DIRECTORY PER PROFILE, never one directory holding several. A browser takes a
// singleton lock per user-data-dir, so a second launch against the same directory hands off to
// the first process and exits. Several profiles in one directory would therefore be ONE
// browser, and CDP reports no profile on a target, so nothing downstream could tell which
// window belonged to which login.
//
// This is Node rather than a shell script on purpose: no shell-string quoting around paths
// that genuinely contain spaces ("Application Support"), and the same file works on macOS and
// Linux without a second copy to keep in step.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function die(message) {
  console.error(`[seed] ${message}`);
  process.exit(1);
}

/** The same two files the hub reads, in the same order. */
function readConfig() {
  for (const file of ["hub.config.json", "hub.config.example.json"]) {
    const full = path.join(appRoot, file);
    if (!existsSync(full)) continue;
    try {
      return { file, root: JSON.parse(readFileSync(full, "utf8")) };
    } catch (err) {
      die(`${file} is not valid JSON: ${err.message}`);
    }
  }
  return { file: "hub.config.json", root: {} };
}

const expandHome = (p) =>
  p === "~" ? os.homedir() : p.startsWith("~/") || p.startsWith("~\\") ? path.join(os.homedir(), p.slice(2)) : p;
const resolve = (p) => (path.isAbsolute(expandHome(p)) ? expandHome(p) : path.join(appRoot, expandHome(p)));

const { file: configFile, root: config } = readConfig();
const B = typeof config.browser === "object" && config.browser !== null ? config.browser : {};
const profiles = Array.isArray(B.profiles) ? B.profiles : [];
const browsers = typeof B.browsers === "object" && B.browsers !== null ? B.browsers : {};
const destRoot = resolve(typeof B.userDataDir === "string" ? B.userDataDir : "~/.attention-hub/browser-data");

if (!["darwin", "linux"].includes(process.platform)) {
  die(`the browser pane runs on macOS and Linux, and this machine is ${process.platform}. Nothing to seed.`);
}
if (profiles.length === 0) {
  die(`no browser profiles are configured in ${configFile}. Add one under "browser.profiles" first.`);
}

const want = process.argv[2] ?? "";
const chosen = profiles.filter((p) => want === "" || p?.id === want);
if (chosen.length === 0) {
  die(`there is no browser profile "${want}". Configured profiles are: ${profiles.map((p) => p?.id).join(", ")}`);
}

/** Where a browser keeps its real profiles ON THIS PLATFORM. A single string is accepted for
 * someone with one machine; an object is keyed by platform, because the answer differs. */
function seedRootFor(browserName) {
  const entry = typeof browsers[browserName] === "object" && browsers[browserName] !== null ? browsers[browserName] : {};
  const raw = entry.seedFrom;
  if (typeof raw === "string") return raw.length > 0 ? expandHome(raw) : "";
  if (typeof raw === "object" && raw !== null && typeof raw[process.platform] === "string") {
    return expandHome(raw[process.platform]);
  }
  return "";
}

/**
 * FAIL CLOSED IF THAT BROWSER IS USING THIS PROFILE. A profile is a set of live LevelDBs, and
 * copying one out from under a running browser yields a torn snapshot. The failure mode is not
 * a clean error: it is a browser that looks fine and has quietly lost state.
 *
 * ASK THE RIGHT QUESTION, though. Refusing whenever ANY process named like the browser is
 * alive is wrong and blocks a legitimate run: a leaked headless job on its own throwaway data
 * directory is nowhere near your real profile. Chromium answers this precisely. SingletonLock
 * is the lock IT takes on a data directory, a symlink whose target ends in the owning pid. A
 * live pid means hands off. A stale lock left by a crash is not a reason to refuse.
 */
function lockHolder(root) {
  const lock = path.join(root, "SingletonLock");
  try {
    if (!lstatSync(lock).isSymbolicLink()) return null;
  } catch {
    return null; // no lock at all
  }
  const target = readlinkSync(lock);
  const pid = Number(target.slice(target.lastIndexOf("-") + 1));
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0); // signal 0 asks "is this pid alive", it does not signal anything
    return pid;
  } catch {
    console.log(`[seed] note: ${root} has a STALE SingletonLock (pid ${pid} is gone), continuing.`);
    return null;
  }
}

/** The caches are the bulk of a profile and none of its meaning. They rebuild themselves, and
 * copying them would multiply the disk cost of this for nothing. */
const SKIP = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GrShaderCache",
  "ShaderCache",
  "CacheStorage",
  "ScriptCache",
  "blob_storage",
  "File System",
  "Application Cache",
  "component_crx_cache",
  "optimization_guide_model_store",
]);

function directorySize(dir) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry);
      let info;
      try {
        info = lstatSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(full);
      else total += info.size;
    }
  };
  walk(dir);
  return total;
}

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/** How many extensions landed in the copy. REPORTED, never asserted: whether a given one
 * survives a move is a fact about this machine. */
function extensionCount(dest) {
  const prefs = path.join(dest, "Default", "Secure Preferences");
  if (!existsSync(prefs)) return "unknown (no preferences file in the copy)";
  try {
    const settings = JSON.parse(readFileSync(prefs, "utf8")).extensions?.settings ?? {};
    const named = Object.values(settings).filter((v) => typeof v?.manifest?.name === "string");
    return `${named.length} extension(s) came across`;
  } catch {
    return "unknown (preferences unreadable)";
  }
}

/** The copy becomes the browser's ordinary "Default", so the profile index in "Local State"
 * must not keep pointing at the folder name it had before, or the browser goes looking for a
 * directory that is not there. */
function retargetLocalState(dest, oldDirName) {
  const file = path.join(dest, "Local State");
  if (!existsSync(file)) return;
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const info = data.profile?.info_cache?.[oldDirName];
    data.profile = data.profile ?? {};
    data.profile.info_cache = info === undefined ? {} : { Default: info };
    data.profile.last_used = "Default";
    data.profile.profiles_order = ["Default"];
    writeFileSync(file, JSON.stringify(data));
  } catch (err) {
    console.log(`[seed] note: could not retarget "Local State" (${err.message}). The copy may show a profile picker.`);
  }
}

mkdirSync(destRoot, { recursive: true });
console.log(`[seed] reading ${configFile}`);
console.log(`[seed] into  ${destRoot}`);
console.log("");

let made = 0;
for (const profile of chosen) {
  const id = profile?.id;
  const label = profile?.label ?? id;
  const browserName = typeof profile?.browser === "string" && profile.browser.length > 0 ? profile.browser : "chrome";
  const sourceDirName = typeof profile?.dir === "string" ? profile.dir : "Default";
  if (typeof id !== "string" || id.length === 0) {
    console.log("[seed] SKIP a profile row with no id");
    continue;
  }

  const sourceRoot = seedRootFor(browserName);
  const source = sourceRoot.length > 0 ? path.join(sourceRoot, sourceDirName) : "";
  const dest = path.join(destRoot, id);

  if (sourceRoot.length === 0 || !existsSync(sourceRoot)) {
    console.log(
      `[seed] SKIP ${id} (${label}): no ${browserName} data at ${sourceRoot || "<unset>"}. Check "browser.browsers.${browserName}.seedFrom".`,
    );
    continue;
  }
  const holder = lockHolder(sourceRoot);
  if (holder !== null) {
    console.log(`[seed] REFUSING ${id} (${label}): ${browserName} (pid ${holder}) is using ${sourceRoot} right now.`);
    console.log(`[seed]   Quit ${browserName} completely, not just its windows, then run this again.`);
    console.log("[seed]   Copying a live profile tears its databases, and the damage does not announce itself.");
    continue;
  }
  if (!existsSync(source)) {
    console.log(`[seed] SKIP ${id} (${label}): no such profile folder. Looked for ${source}`);
    continue;
  }
  if (existsSync(path.join(dest, "Default")) && process.env["RESEED"] !== "1") {
    console.log(`[seed] SKIP ${id} (${label}): already set up at ${dest}   (RESEED=1 to overwrite)`);
    continue;
  }

  console.log(`[seed] ${id} (${label}) from ${browserName} / ${sourceDirName}`);
  mkdirSync(dest, { recursive: true });
  cpSync(source, path.join(dest, "Default"), {
    recursive: true,
    force: true,
    // A profile is full of sockets, lock files and symlinks that mean nothing in a copy, and
    // one unreadable entry must not abort the whole thing.
    filter: (from) => {
      const name = path.basename(from);
      if (SKIP.has(name)) return false;
      try {
        const info = lstatSync(from);
        return info.isDirectory() || info.isFile();
      } catch {
        return false;
      }
    },
  });
  // "Local State" is user-data-dir level, not profile level, and the browser reads things from
  // it that a profile alone cannot supply. Copied per data directory, which is one more reason
  // each profile gets its own.
  const localState = path.join(sourceRoot, "Local State");
  if (existsSync(localState)) cpSync(localState, path.join(dest, "Local State"), { force: true });
  retargetLocalState(dest, sourceDirName);

  console.log(`[seed]   ${human(directorySize(dest))} . ${extensionCount(dest)}`);
  made += 1;
}

console.log("");
if (made === 0) {
  console.log("[seed] nothing was copied. Read the lines above: each one names what to fix.");
} else {
  console.log(`[seed] done, ${made} profile(s) ready. Start the sidecar with: npm run browser`);
  console.log("[seed] then open the browser pane and pick the profile.");
  console.log("[seed] First open of each: press WINDOW in the pane to bring the real browser");
  console.log("[seed] forward, check it is signed in as you expect, then press PARK.");
  console.log("[seed] A browser the hub opened keeps running: nothing in the hub can quit it.");
}
