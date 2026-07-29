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

/** OFF. A browser shell is the largest surface this product has, so a stranger's
 * first install does not come with one open. docs/terminal.md says why at length. */
const TERMINAL_ENABLED_DEFAULT = false;
/** The pty sidecar's loopback port. Written in three places (here, the sidecar,
 * and the example config) and asserted equal by .githooks/release-check.sh. */
const TERMINAL_PORT_DEFAULT = 2887; // check-paths-allow: the documented default, asserted equal to hub.config.example.json and pty/server.mjs by release-check.sh
const TERMINAL_TMUX_DEFAULT = true;
const TERMINAL_PREFIX_DEFAULT = "hub";
const TERMINAL_SCROLLBACK_DEFAULT = 2000;
const TERMINAL_IDLE_MINUTES_DEFAULT = 30;

/** A profile name and a pane id both become an id in a DOM attribute and a
 * localStorage key, so they are slugs. The error message says so in plain words. */
const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const SLUG_EXPECTED =
  "a lowercase name of letters, numbers, dashes or underscores, starting with a letter or number";

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
  /** Absolute working directory, for a pane whose kind uses one (today only
   * `terminal`). null falls back to `terminal.cwd`, then your home directory.
   * The cwd is resolved HERE, on the server, from config: a client never sends
   * one, so a browser cannot pick the directory a shell opens in. */
  cwd: string | null;
}

export interface WallConfig {
  /** The declared panes. EMPTY is the normal case: the wall then shows one pane
   * per configured profile, in config order, so four accounts give the 2x2. */
  panes: WallPane[];
  /** The kind a derived (profile) pane gets. */
  paneKind: PaneKind;
}

/** The pty sidecar. A `terminal` pane is a real shell on this machine, so every
 * knob here is a security knob and the section ships switched OFF.
 *
 * macOS and Linux only, stated plainly: the sidecar is tmux-backed. The repo's
 * Windows-first-class rule does not reach this one module and pretending
 * otherwise would ship a broken promise. See docs/terminal.md. */
export interface TerminalConfig {
  /** OFF by default. Nothing about the terminal exists until you set this true. */
  enabled: boolean;
  /** The sidecar's port on loopback. The sidecar binds 127.0.0.1 and nothing else. */
  port: number;
  /** An explicit WebSocket URL, for reaching the sidecar through your own proxy.
   * null builds ws://127.0.0.1:<port>, which is the local case. */
  url: string | null;
  /** tmux-backed sessions, so a session survives navigation, a sidecar restart
   * and sleep, and stays attachable from a real terminal. false is a raw pty:
   * it works, and it survives none of that. */
  tmux: boolean;
  /** Prefix for the tmux session name, which is `<prefix>-<pane id>`. */
  sessionPrefix: string;
  /** Default working directory for a terminal pane. null = your home directory. */
  cwd: string | null;
  /** The shell to run. null = the SHELL environment variable, else /bin/sh. */
  shell: string | null;
  /** Lines of tmux history replayed on attach, so a reattach is not a blank screen. */
  scrollback: number;
  /** Minutes of silence before the socket is dropped. The tmux session survives. */
  idleMinutes: number;
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
  /** The accounts. Empty is honest: the wall says it has no panes configured. */
  profiles: Record<string, Profile>;
  wall: WallConfig;
  terminal: TerminalConfig;
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
    const cwd = optString(entry, "cwd", `${where}.cwd`);
    return {
      id,
      profile,
      kind: entryKind === undefined || entryKind === null ? paneKind : parsePaneKind(entryKind, `${where}.kind`),
      label: optString(entry, "label", `${where}.label`),
      cwd: cwd === null ? null : resolvePath(cwd),
    };
  });
  return { panes, paneKind };
}

function parseTerminal(root: Record<string, unknown>): TerminalConfig {
  const raw = section(root, "terminal");
  const port = int(raw, "port", "terminal.port", TERMINAL_PORT_DEFAULT);
  if (port < 1 || port > 65535) throw configError("terminal.port", "a number between 1 and 65535");

  // A tmux session name may not contain a dot or a colon (tmux reads those as
  // window and pane addresses), and the prefix also lands in a process argument.
  // A slug avoids both problems and the message says which characters are fine.
  const sessionPrefix = str(raw, "sessionPrefix", "terminal.sessionPrefix", TERMINAL_PREFIX_DEFAULT);
  if (!SLUG.test(sessionPrefix)) {
    throw configError("terminal.sessionPrefix", `${SLUG_EXPECTED} (it becomes part of the tmux session name)`);
  }

  const scrollback = int(raw, "scrollback", "terminal.scrollback", TERMINAL_SCROLLBACK_DEFAULT);
  if (scrollback < 0) throw configError("terminal.scrollback", "zero or a positive number of lines");
  const idleMinutes = int(raw, "idleMinutes", "terminal.idleMinutes", TERMINAL_IDLE_MINUTES_DEFAULT);
  if (idleMinutes < 1) throw configError("terminal.idleMinutes", "at least 1 minute");

  const cwd = optString(raw, "cwd", "terminal.cwd");
  const shell = optString(raw, "shell", "terminal.shell");
  return {
    enabled: bool(raw, "enabled", "terminal.enabled", TERMINAL_ENABLED_DEFAULT),
    port,
    url: optString(raw, "url", "terminal.url"),
    tmux: bool(raw, "tmux", "terminal.tmux", TERMINAL_TMUX_DEFAULT),
    sessionPrefix,
    cwd: cwd === null ? null : resolvePath(cwd),
    shell: shell === null ? null : expandPath(shell),
    scrollback,
    idleMinutes,
  };
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
    profiles,
    // The wall validates pane.profile against the profiles above, so it is
    // parsed last and takes them as an argument rather than re-reading the file.
    wall: parseWall(root, profiles),
    terminal: parseTerminal(root),
  };
  return cached;
}

/** Drop the cache. For tests and for a future live-reload on file change. */
export function resetConfigCache(): void {
  cached = null;
  readFrom = CONFIG_FILE;
}
