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
  cached = {
    hub: parseHub(root),
    bind: parseBind(root),
    dataDir: resolvePath(str(root, "dataDir", "dataDir", DATA_DIR_DEFAULT)),
    userDir: resolvePath(str(root, "userDir", "userDir", USER_DIR_DEFAULT)),
    update: parseUpdate(root),
    adapters: parseAdapters(root),
    modules: parseModules(root),
  };
  return cached;
}

/** Drop the cache. For tests and for a future live-reload on file change. */
export function resetConfigCache(): void {
  cached = null;
  readFrom = CONFIG_FILE;
}
