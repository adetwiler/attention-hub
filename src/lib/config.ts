// The config loader. hub.config.json at the hub root is the single registry:
// EVERYTHING path-like and port-like comes from here, so there are zero
// hardcoded paths in this codebase (scripts/check-paths.mjs enforces that).
//
// Three laws this file exists to hold:
//
//   DEFAULTS FIRST. Every knob has a module constant fallback below. A missing
//   file, an empty file, or a config with half its sections deleted all boot
//   and run. Setup is never a prerequisite for the app starting.
//
//   HONEST ABSENCE. An unconfigured surface resolves to null and the UI SAYS
//   it is not configured. It never errors, and it never invents data to fill
//   the space.
//
//   SEED VERSUS STATE. Config is the registry (what exists). SQLite holds live
//   state (ordering, toggles, timestamps). That split is what lets an update
//   replace the code without touching anything of yours.
//
// Note for editors: the parsed config is cached for the life of the process, so
// a config-only change takes effect on the next restart. The setup docs say so
// out loud, because it is the first thing that confuses a new user.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------- defaults

const CONFIG_FILE = "hub.config.json";
const CONFIG_EXAMPLE_FILE = "hub.config.example.json";

const HUB_NAME_DEFAULT = "Attention Hub";
/** Who the ledger records an action against when the config does not say. */
const ACTOR_DEFAULT = "you";
/** Loopback, always. Reaching the hub from elsewhere is an explicit choice. */
const BIND_HOST_DEFAULT = "127.0.0.1";
const BIND_PORT_DEFAULT = 2886; // check-paths-allow: the documented default, asserted equal to hub.config.example.json and scripts/serve.mjs by release-check.sh
const DATA_DIR_DEFAULT = "data";
const USER_DIR_DEFAULT = "user";
const UPDATE_REPO_DEFAULT = "adetwiler/attention-hub";
const UPDATE_HOURS_DEFAULT = 24;
/** What a wall pane holds when nothing says otherwise. See PANE_KINDS below. */
const PANE_KIND_DEFAULT: PaneKind = "placeholder";

/** A profile name and a pane id both become an id in a DOM attribute and a
 * localStorage key, so they are slugs. The error message says so in plain words. */
const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const SLUG_EXPECTED =
  "a lowercase name of letters, numbers, dashes or underscores, starting with a letter or number";

/** The browser sidecar's loopback port. Three copies of this number exist on
 * purpose (here, chrome/server.mjs, and hub.config.example.json) because the
 * sidecar boots without the TypeScript loader; release-check.sh fails if they
 * disagree, for the same reason it guards the hub's own port. */
const BROWSER_PORT_DEFAULT = 2887; // check-paths-allow: the documented default, asserted equal to hub.config.example.json and chrome/server.mjs by release-check.sh
const BROWSER_DATA_DIR_DEFAULT = "~/.attention-hub/browser-data";
const BROWSER_HOME_URL_DEFAULT = "https://duckduckgo.com"; // hub-no-request: a default the USER's browser may visit. Nothing in the hub requests it.
const BROWSER_SEARCH_URL_DEFAULT = "https://duckduckgo.com/?q={}"; // hub-no-request: a default the USER's browser may visit. Nothing in the hub requests it.
const BROWSER_QUALITY_DEFAULT = 60;
const BROWSER_IDLE_MS_DEFAULT = 30 * 60 * 1000;
/** Far enough off any real desktop that the window is out of sight. macOS
 * clamps it (see docs/browser-pane.md); Linux honours it. */
const BROWSER_WINDOW_POSITION_DEFAULT: [number, number] = [-3200, 0];
const BROWSER_WINDOW_SIZE_DEFAULT: [number, number] = [1440, 900];

/** Where a Chromium browser is found, and where its real profiles live, per
 * platform. This is the whole of the hub's browser discovery: paths first
 * (a service manager gives a process a minimal PATH, so resolving by name alone
 * reports "not installed" on a machine that is running it), then names on PATH
 * so an install in an unusual place still works. */
const BROWSER_BINARIES_DEFAULT: Record<string, RawBrowserBinary> = {
  chrome: {
    bin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/opt/google/chrome/chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
    ],
    names: ["google-chrome", "google-chrome-stable"],
    seedFrom: {
      darwin: "~/Library/Application Support/Google/Chrome",
      linux: "~/.config/google-chrome",
    },
  },
  chromium: {
    bin: [
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    ],
    names: ["chromium", "chromium-browser"],
    seedFrom: {
      darwin: "~/Library/Application Support/Chromium",
      linux: "~/.config/chromium",
    },
  },
};

// ---------------------------------------------------------------- types

export interface HubIdentity {
  /** Shown in the topbar. Yours to rename. */
  name: string;
  /** The name recorded on every ledger row this hub writes. */
  actor: string;
}

export interface BindConfig {
  host: string;
  port: number;
  /** Extra hostnames the hub is reached through. See next.config.ts for why. */
  allowedDevOrigins: string[];
}

export interface UpdateConfig {
  /** false means the hub makes no network calls at all. */
  enabled: boolean;
  /** "owner/name" as the GitHub Releases API takes it. */
  repo: string;
  checkEveryHours: number;
}

/** One AI command-line tool the hub can hand work to. Vendor neutral by design. */
export interface AgentAdapter {
  /** The binary, PATH-resolved or absolute. */
  bin: string;
  /** Fixed leading arguments. Never caller-supplied. */
  args: string[];
  /** Shown in the UI when this adapter is picked. */
  label: string;
  /** Built to spec but not exercised against a real install. The UI says so. */
  untested: boolean;
}

export interface AdaptersConfig {
  /** Key into `agents`. null = no agent configured, and surfaces say so. */
  default: string | null;
  agents: Record<string, AgentAdapter>;
}

export interface ModulesConfig {
  /** Module ids switched on. Empty means the core defaults. */
  enabled: string[];
}

/** A browser entry as it is written in the config, before this platform is
 * picked out of `seedFrom`. Only this file ever sees this shape. */
interface RawBrowserBinary {
  bin: string[];
  names: string[];
  seedFrom: Record<string, string>;
}

/** One Chromium browser the hub can drive, resolved for the platform it is
 * running on. Chrome and Chromium are the same engine, so one mechanism covers
 * both, and a `browsers` entry is a config row rather than a code change. */
export interface BrowserBinary {
  /** Absolute candidate paths, first one that exists wins. */
  bin: string[];
  /** Command names to look for on PATH when no candidate path exists. */
  names: string[];
  /** Where that browser keeps YOUR real profiles on THIS platform, the source
   * for the one-time seed copy. Empty means the platform is not covered. */
  seedFrom: string;
}

/** One browser profile the pane can mirror: its own data directory, its own
 * browser process, its own debugging port. One profile is one signed-in
 * identity, which is the whole reason there is more than one. */
export interface BrowserProfile {
  /** Stable slug. It is also this profile's directory name under userDataDir. */
  id: string;
  label: string;
  /** Which entry of `browsers` this profile runs in. */
  browser: string;
  /** This profile's debugging port. EXPLICIT and permanent, never derived from
   * position in the list: see docs/browser-pane.md for the reorder that made
   * a derived port present as the wrong browser's tabs under the right label. */
  port: number;
  /** The folder to copy FROM in your real browser ("Default", "Profile 1").
   * Read by the seed script, never by the app. */
  dir: string;
  /** Display only, so the pane can say which login this is. Blank is fine. */
  account: string;
}

export interface BrowserConfig {
  /** The browser sidecar's loopback port. chrome/server.mjs reads the same key. */
  sidecarPort: number;
  /** Absolute. The parent of the hub's per-profile browser data directories.
   * NEVER your real one: Chrome 136+ refuses to be debugged on its default
   * data directory, so the hub drives its own copy. */
  userDataDir: string;
  browsers: Record<string, BrowserBinary>;
  /** Where the real browser window is parked, off the desktop. */
  windowPosition: [number, number];
  windowSize: [number, number];
  /** JPEG quality of the mirrored frames, 1 to 100. */
  quality: number;
  /** A silent socket is dropped after this. The browser keeps running. */
  idleMs: number;
  homeUrl: string;
  /** Where a typed phrase goes when it is not a URL. `{}` is the phrase,
   * url-encoded. Config, not code: which search engine you use is yours. */
  searchUrl: string;
  /** Empty is the honest default: the pane says no profile is set up yet.
   *
   * NOT the same list as the top-level `profiles` below. That one is the
   * ACCOUNTS you work under (a label and your AI tool's config directory); this
   * one is the BROWSER DATA DIRECTORIES the pane can mirror. They are separate
   * because a browser profile carries a browser's own constraints (its own
   * debugging port, its own singleton lock, a one-time seeded copy), and by
   * convention an id here matches an account name so a pane reads as "that
   * account's browser". */
  profiles: BrowserProfile[];
}

/** One account you work under. The key in `profiles` is its name, and the wall
 * shows one pane per profile unless `wall.panes` says otherwise. */
export interface Profile {
  /** Shown on the pane and its chip. Falls back to the profile name. */
  label: string;
  /** Absolute. That account's config directory for your AI tool. null = this
   * profile is not tied to one, which is fine: a pane may hold anything. */
  configDir: string | null;
}

/** What a pane HOLDS. The grid never reads this: it owns the layout, the focus
 * model and the pane frame, and one content component per kind fills the body.
 *
 * This union is the registry of kind NAMES, deliberately wider than what the
 * current version can render, so that a config written for a later release
 * still validates and the wall says honestly which pane is not built yet
 * instead of refusing the whole file. `src/components/paneContent.tsx` maps
 * every name here to a component, and the Record type makes a missing row a
 * compile error. See docs/adr/0004-pane-content-contract.md. */
export type PaneKind = "placeholder" | "terminal" | "browser";

export const PANE_KINDS: readonly PaneKind[] = ["placeholder", "terminal", "browser"];

/** One pane of the wall, as declared in config. */
export interface WallPane {
  /** Stable id. The focus selection and the DOM node are keyed on it. */
  id: string;
  kind: PaneKind;
  /** Key into `profiles`, or null for a pane not tied to an account. */
  profile: string | null;
  /** An explicit override. null falls back to the profile label, then the id. */
  label: string | null;
}

export interface WallConfig {
  /** The declared panes. EMPTY is the normal case: the wall then shows one pane
   * per configured profile, in config order, so four accounts give the 2x2. */
  panes: WallPane[];
  /** The kind a derived (profile) pane gets. */
  paneKind: PaneKind;
}

export interface HubConfig {
  hub: HubIdentity;
  bind: BindConfig;
  /** Absolute. The hub's database and working files. */
  dataDir: string;
  /** Absolute. YOUR modules and pages. Updates never touch anything under it. */
  userDir: string;
  update: UpdateConfig;
  adapters: AdaptersConfig;
  modules: ModulesConfig;
  browser: BrowserConfig;
  /** The accounts. Empty is honest: the wall says it has no panes configured. */
  profiles: Record<string, Profile>;
  wall: WallConfig;
}

// ---------------------------------------------------------------- helpers

/** Expand a leading ~ to the home directory. Config may use it; code never assumes it. */
export function expandPath(raw: string): string {
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

/** Resolve a config path to an absolute one, relative paths against the hub root. */
function resolvePath(raw: string): string {
  const expanded = expandPath(raw);
  if (path.isAbsolute(expanded)) return expanded;
  // turbopackIgnore: a runtime join, not a static import. See readRoot below.
  return path.join(/*turbopackIgnore: true*/ process.cwd(), expanded);
}

/** The file readRoot() actually read. On a fresh install that is the EXAMPLE, and
 * telling someone to fix a key in a file they do not have is the one way this
 * loader's whole vocabulary (name the exact place) can be worse than useless. */
let readFrom: string = CONFIG_FILE;

/** Every validation error names the exact place in the file. That is the whole vocabulary. */
function configError(where: string, expected: string): Error {
  return new Error(`${readFrom}: expected ${expected} at "${where}"`);
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw configError(where, "an object");
  }
  return value as Record<string, unknown>;
}

/** A missing section is never an error: it falls back to the documented default. */
function section(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const raw = root[key];
  if (raw === undefined || raw === null) return {};
  return asRecord(raw, key);
}

function optString(raw: Record<string, unknown>, key: string, where: string): string | null {
  const value = raw[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw configError(where, "a non-empty string");
  }
  return value;
}

function str(raw: Record<string, unknown>, key: string, where: string, fallback: string): string {
  return optString(raw, key, where) ?? fallback;
}

function int(raw: Record<string, unknown>, key: string, where: string, fallback: number): number {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw configError(where, "a whole number");
  }
  return value;
}

function bool(raw: Record<string, unknown>, key: string, where: string, fallback: boolean): boolean {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw configError(where, "true or false");
  return value;
}

function stringList(raw: Record<string, unknown>, key: string, where: string): string[] {
  const value = raw[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw configError(where, "a list of strings");
  return value.map((entry, i) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw configError(`${where}[${i}]`, "a non-empty string");
    }
    return entry;
  });
}

/** Keys starting with $ are inline comments in the JSON. Skip them everywhere. */
function isComment(key: string): boolean {
  return key.startsWith("$");
}

// ---------------------------------------------------------------- parsers

function parseHub(root: Record<string, unknown>): HubIdentity {
  const raw = section(root, "hub");
  return {
    name: str(raw, "name", "hub.name", HUB_NAME_DEFAULT),
    actor: str(raw, "actor", "hub.actor", ACTOR_DEFAULT),
  };
}

function parseBind(root: Record<string, unknown>): BindConfig {
  const raw = section(root, "bind");
  const port = int(raw, "port", "bind.port", BIND_PORT_DEFAULT);
  if (port < 1 || port > 65535) {
    throw configError("bind.port", "a number between 1 and 65535");
  }
  return {
    host: str(raw, "host", "bind.host", BIND_HOST_DEFAULT),
    port,
    allowedDevOrigins: stringList(raw, "allowedDevOrigins", "bind.allowedDevOrigins"),
  };
}

function parseUpdate(root: Record<string, unknown>): UpdateConfig {
  const raw = section(root, "update");
  const repo = str(raw, "repo", "update.repo", UPDATE_REPO_DEFAULT);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw configError("update.repo", 'an "owner/name" repository slug');
  }
  return {
    enabled: bool(raw, "enabled", "update.enabled", true),
    repo,
    checkEveryHours: int(raw, "checkEveryHours", "update.checkEveryHours", UPDATE_HOURS_DEFAULT),
  };
}

function parseAgent(raw: unknown, key: string): AgentAdapter {
  const entry = asRecord(raw, `adapters.agents.${key}`);
  const bin = optString(entry, "bin", `adapters.agents.${key}.bin`);
  if (bin === null) throw configError(`adapters.agents.${key}.bin`, "a non-empty string");
  return {
    bin: expandPath(bin),
    args: stringList(entry, "args", `adapters.agents.${key}.args`),
    label: str(entry, "label", `adapters.agents.${key}.label`, key),
    untested: bool(entry, "untested", `adapters.agents.${key}.untested`, false),
  };
}

function parseAdapters(root: Record<string, unknown>): AdaptersConfig {
  const raw = section(root, "adapters");
  const agentsRaw = section(raw, "agents");
  const agents: Record<string, AgentAdapter> = {};
  for (const key of Object.keys(agentsRaw)) {
    if (isComment(key)) continue;
    agents[key] = parseAgent(agentsRaw[key], key);
  }
  const fallback = optString(raw, "default", "adapters.default");
  if (fallback !== null && agents[fallback] === undefined) {
    throw configError("adapters.default", `the name of a configured agent (have: ${Object.keys(agents).join(", ") || "none"})`);
  }
  return { default: fallback, agents };
}

function parseModules(root: Record<string, unknown>): ModulesConfig {
  const raw = section(root, "modules");
  return { enabled: stringList(raw, "enabled", "modules.enabled") };
}

/** A pair of numbers, or the documented default. A half-written pair is a
 * mistake worth naming rather than silently half-honouring. */
function numberPair(
  raw: Record<string, unknown>,
  key: string,
  where: string,
  fallback: [number, number],
): [number, number] {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value) || value.length !== 2) {
    throw configError(where, "a list of exactly two numbers");
  }
  const [a, b] = value;
  if (typeof a !== "number" || typeof b !== "number") {
    throw configError(where, "a list of exactly two numbers");
  }
  return [a, b];
}

/** `seedFrom` is written per platform, because a browser keeps its profiles in
 * a different place on macOS than on Linux and a single string would be wrong
 * on one of them. An unlisted platform yields "", which the seed script reports
 * as "not covered here" rather than guessing. */
function platformSeed(raw: unknown, where: string): string {
  if (raw === undefined || raw === null) return "";
  // A plain string is accepted for the person who only has one machine.
  if (typeof raw === "string") return expandPath(raw);
  const byPlatform = asRecord(raw, where);
  const here = byPlatform[process.platform];
  if (here === undefined || here === null) return "";
  if (typeof here !== "string" || here.trim() === "") {
    throw configError(`${where}.${process.platform}`, "a non-empty string");
  }
  return expandPath(here);
}

function parseBrowserBinary(raw: unknown, key: string): BrowserBinary {
  const where = `browser.browsers.${key}`;
  const entry = asRecord(raw, where);
  return {
    bin: stringList(entry, "bin", `${where}.bin`),
    names: stringList(entry, "names", `${where}.names`),
    seedFrom: platformSeed(entry["seedFrom"], `${where}.seedFrom`),
  };
}

function parseBrowserProfile(raw: unknown, index: number, ids: Set<string>, ports: Set<number>): BrowserProfile {
  const where = `browser.profiles[${index}]`;
  const entry = asRecord(raw, where);

  const id = optString(entry, "id", `${where}.id`);
  // The id BECOMES A DIRECTORY NAME under userDataDir and travels on the wire,
  // so it is held to the same slug rule as a pane id rather than merely checked
  // for separators.
  if (id === null || !SLUG.test(id)) {
    throw configError(`${where}.id`, `${SLUG_EXPECTED} (the id becomes this profile's data directory name)`);
  }
  // A DUPLICATE ID IS A CONFIG ERROR, not a last-one-wins shrug: the id keys
  // this profile's data directory, so two rows sharing one would quietly point
  // two profiles at a single browser.
  if (ids.has(id)) throw configError(`${where}.id`, `an id not already used ("${id}" appears twice)`);
  ids.add(id);

  const label = optString(entry, "label", `${where}.label`);
  if (label === null) throw configError(`${where}.label`, "a non-empty string");

  // The source directory is a SINGLE folder name inside your real browser. A
  // separator or a traversal would send the seed script copying from outside it.
  const dir = optString(entry, "dir", `${where}.dir`);
  if (dir === null || dir.includes("/") || dir.includes("\\") || dir === "." || dir === "..") {
    throw configError(`${where}.dir`, "a plain folder name like \"Default\" or \"Profile 1\"");
  }

  const port = entry["port"];
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw configError(`${where}.port`, "a whole number between 1024 and 65535");
  }
  // A SHARED PORT IS TWO PROFILES POINTING AT ONE BROWSER, and it presents as
  // the wrong profile's tabs under the right label, which reads as a rendering
  // bug rather than a config one.
  if (ports.has(port)) throw configError(`${where}.port`, `a port not already used (${port} appears twice)`);
  ports.add(port);

  return {
    id,
    label,
    browser: str(entry, "browser", `${where}.browser`, "chrome"),
    port,
    dir,
    account: optString(entry, "account", `${where}.account`) ?? "",
  };
}

function parseBrowser(root: Record<string, unknown>): BrowserConfig {
  const raw = section(root, "browser");

  const browsersRaw = raw["browsers"];
  const browsers: Record<string, BrowserBinary> = {};
  if (browsersRaw === undefined || browsersRaw === null) {
    for (const [key, value] of Object.entries(BROWSER_BINARIES_DEFAULT)) {
      browsers[key] = { bin: value.bin, names: value.names, seedFrom: platformSeed(value.seedFrom, key) };
    }
  } else {
    for (const [key, value] of Object.entries(asRecord(browsersRaw, "browser.browsers"))) {
      if (isComment(key)) continue;
      browsers[key] = parseBrowserBinary(value, key);
    }
  }

  const quality = int(raw, "quality", "browser.quality", BROWSER_QUALITY_DEFAULT);
  if (quality < 1 || quality > 100) throw configError("browser.quality", "a number between 1 and 100");

  const port = int(raw, "sidecarPort", "browser.sidecarPort", BROWSER_PORT_DEFAULT);
  if (port < 1 || port > 65535) throw configError("browser.sidecarPort", "a number between 1 and 65535");

  const profilesRaw = raw["profiles"];
  if (profilesRaw !== undefined && profilesRaw !== null && !Array.isArray(profilesRaw)) {
    throw configError("browser.profiles", "a list of profiles");
  }
  const ids = new Set<string>();
  const ports = new Set<number>();

  return {
    sidecarPort: port,
    userDataDir: resolvePath(str(raw, "userDataDir", "browser.userDataDir", BROWSER_DATA_DIR_DEFAULT)),
    browsers,
    windowPosition: numberPair(raw, "windowPosition", "browser.windowPosition", BROWSER_WINDOW_POSITION_DEFAULT),
    windowSize: numberPair(raw, "windowSize", "browser.windowSize", BROWSER_WINDOW_SIZE_DEFAULT),
    quality,
    idleMs: int(raw, "idleMs", "browser.idleMs", BROWSER_IDLE_MS_DEFAULT),
    homeUrl: str(raw, "homeUrl", "browser.homeUrl", BROWSER_HOME_URL_DEFAULT),
    searchUrl: str(raw, "searchUrl", "browser.searchUrl", BROWSER_SEARCH_URL_DEFAULT),
    profiles: (Array.isArray(profilesRaw) ? profilesRaw : []).map((p, i) => parseBrowserProfile(p, i, ids, ports)),
  };
}

function parseProfiles(root: Record<string, unknown>): Record<string, Profile> {
  const raw = section(root, "profiles");
  const profiles: Record<string, Profile> = {};
  for (const key of Object.keys(raw)) {
    if (isComment(key)) continue;
    if (!SLUG.test(key)) throw configError(`profiles.${key}`, `${SLUG_EXPECTED} (the name becomes the pane's id)`);
    const entry = asRecord(raw[key], `profiles.${key}`);
    const dir = optString(entry, "configDir", `profiles.${key}.configDir`);
    profiles[key] = {
      label: str(entry, "label", `profiles.${key}.label`, key),
      configDir: dir === null ? null : resolvePath(dir),
    };
  }
  return profiles;
}

function parsePaneKind(value: unknown, where: string): PaneKind {
  for (const kind of PANE_KINDS) {
    if (value === kind) return kind;
  }
  throw configError(where, `one of: ${PANE_KINDS.join(", ")}`);
}

function parseWall(root: Record<string, unknown>, profiles: Record<string, Profile>): WallConfig {
  const raw = section(root, "wall");
  const kindRaw = raw["paneKind"];
  const paneKind =
    kindRaw === undefined || kindRaw === null ? PANE_KIND_DEFAULT : parsePaneKind(kindRaw, "wall.paneKind");

  const listRaw = raw["panes"];
  if (listRaw === undefined || listRaw === null) return { panes: [], paneKind };
  if (!Array.isArray(listRaw)) throw configError("wall.panes", "a list of panes");

  const seen = new Set<string>();
  const known = Object.keys(profiles).join(", ") || "none";
  const panes = listRaw.map((entryRaw, i): WallPane => {
    const where = `wall.panes[${i}]`;
    const entry = asRecord(entryRaw, where);
    const id = optString(entry, "id", `${where}.id`);
    if (id === null) throw configError(`${where}.id`, "a non-empty string");
    if (!SLUG.test(id)) throw configError(`${where}.id`, SLUG_EXPECTED);
    if (seen.has(id)) throw configError(`${where}.id`, `an id no other pane uses (have: ${id})`);
    seen.add(id);
    const profile = optString(entry, "profile", `${where}.profile`);
    if (profile !== null && profiles[profile] === undefined) {
      throw configError(`${where}.profile`, `the name of a configured profile (have: ${known})`);
    }
    const entryKind = entry["kind"];
    return {
      id,
      profile,
      kind: entryKind === undefined || entryKind === null ? paneKind : parsePaneKind(entryKind, `${where}.kind`),
      label: optString(entry, "label", `${where}.label`),
    };
  });
  return { panes, paneKind };
}

// ---------------------------------------------------------------- load

let cached: HubConfig | null = null;

function readRoot(): Record<string, unknown> {
  // The example is the fallback so a fresh clone runs before anyone has copied
  // it. If neither exists the defaults above still produce a working hub.
  for (const file of [CONFIG_FILE, CONFIG_EXAMPLE_FILE]) {
    let text: string;
    try {
      // The turbopackIgnore marker tells the bundler this runtime read is not a
      // static import. Without it the tracer assumes the whole project is a
      // dependency of this route and traces every file in the repo.
      text = readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${file} is not valid JSON: ${detail}`);
    }
    readFrom = file;
    return asRecord(parsed, "(root)");
  }
  readFrom = CONFIG_FILE;
  return {};
}

/** The parsed, validated config. Cached for the life of the process. */
export function loadConfig(): HubConfig {
  if (cached !== null) return cached;
  const root = readRoot();
  const profiles = parseProfiles(root);
  cached = {
    hub: parseHub(root),
    bind: parseBind(root),
    dataDir: resolvePath(str(root, "dataDir", "dataDir", DATA_DIR_DEFAULT)),
    userDir: resolvePath(str(root, "userDir", "userDir", USER_DIR_DEFAULT)),
    update: parseUpdate(root),
    adapters: parseAdapters(root),
    modules: parseModules(root),
    browser: parseBrowser(root),
    profiles,
    // The wall validates pane.profile against the profiles above, so it is
    // parsed last and takes them as an argument rather than re-reading the file.
    wall: parseWall(root, profiles),
  };
  return cached;
}

/** Drop the cache. For tests and for a future live-reload on file change. */
export function resetConfigCache(): void {
  cached = null;
  readFrom = CONFIG_FILE;
}
