// THE BROWSER PANE, hub side. Which browser profiles exist, whether each has been seeded,
// whether the browser is even installed, and the single-use token a pane socket must present.
//
// The CDP work itself lives in the sidecar (chrome/server.mjs) for two structural reasons: a
// Next route handler cannot upgrade a WebSocket, and scripts/serve.mjs spawns `next` as a
// CHILD process, so there is no server object here to attach an 'upgrade' listener to.
//
// WHY A MIRRORED BROWSER AND NOT AN IFRAME. An iframe cannot show most of the web.
// X-Frame-Options and frame-ancestors are the SITE's headers and no browser is permitted to
// override them, so a framed pane could show almost nothing. A screencast frames nothing: it
// carries a picture of a real tab. Full reasoning and the measurements:
// docs/browser-pane.md and docs/adr/0006-browser-pane-mirrors-a-real-browser.md.
//
// THE CONSTRAINT THAT SHAPES EVERYTHING: since Chrome 136, --remote-debugging-port is IGNORED
// when the data directory is the default one, deliberately, because remote debugging can read
// cookies and passwords. So the hub can never drive the browser you have open, and no flag
// brings that back. It drives its own copy of a profile, seeded once by
// scripts/seed-browser-profile.mjs.
import { randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig, type BrowserProfile } from "./config";
import { getDb } from "./db";

/** Short, because it is handed straight to a socket that presents it immediately. */
const TOKEN_TTL_MS = 60_000;

/** The platforms this pane runs on, stated plainly rather than discovered late. Windows is
 * not one of them: profile seeding and the parked-window trick are both POSIX shaped here,
 * and a surface that cannot work has to SAY so rather than spin. */
const SUPPORTED_PLATFORMS: readonly string[] = ["darwin", "linux"];

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The binary for one named browser. Cached for the process, like the config it reads. */
const binCache = new Map<string, string | null>();

/**
 * Find a browser, EXPLICIT PATHS FIRST and PATH second. The order is the lesson: a process
 * started by launchd or systemd gets a minimal PATH, so resolving by name alone reports "not
 * installed" on a machine that is running it. The PATH pass then covers an install neither
 * the hub nor the user thought to write down (a Nix profile, /usr/local, a wrapper script).
 * Both halves come from config, so adding a browser is a row and never a code change.
 */
export function browserBin(name: string): string | null {
  const hit = binCache.get(name);
  if (hit !== undefined) return hit;
  const entry = loadConfig().browser.browsers[name];
  let found: string | null = null;
  for (const candidate of entry?.bin ?? []) {
    if (candidate.length > 0 && isExecutableFile(candidate)) {
      found = candidate;
      break;
    }
  }
  if (found === null) {
    const dirs = (process.env["PATH"] ?? "").split(path.delimiter).filter((d) => d.length > 0);
    for (const commandName of entry?.names ?? []) {
      const inPath = dirs.map((d) => path.join(d, commandName)).find(isExecutableFile);
      if (inPath !== undefined) {
        found = inPath;
        break;
      }
    }
  }
  binCache.set(name, found);
  return found;
}

/** Drop the cache. For tests, and for the moment a user installs a browser and retries. */
export function resetBrowserBinCache(): void {
  binCache.clear();
}

/** Is ANY configured browser installed? False means the pane says so instead of hanging. */
export function anyBrowserInstalled(): boolean {
  return Object.keys(loadConfig().browser.browsers).some((n) => browserBin(n) !== null);
}

export interface BrowserProfileState extends BrowserProfile {
  /** This profile's own data directory exists, meaning the seed script has run for it. */
  seeded: boolean;
  /** That browser's binary is actually on this machine. */
  installed: boolean;
}

export interface BrowserState {
  /** This platform can run the pane at all. False = the pane says so, in words. */
  supported: boolean;
  /** Why not, when supported is false. Empty otherwise. */
  unsupportedWhy: string;
  /** At least one configured browser is installed. False = the pane says so. */
  browserInstalled: boolean;
  /** Any browser is DECLARED in config at all. False and browserInstalled false are two
   * different problems with two different fixes, so they are two different fields: nothing
   * to look for, versus looked and did not find it. */
  browsersDeclared: boolean;
  sidecarPort: number;
  homeUrl: string;
  searchUrl: string;
  /** The hub's own browser data directory, named in the setup message so the path is never
   * a mystery, and never the user's real one. */
  userDataDir: string;
  /** True once ANY profile is seeded. False = nothing can open yet, and the pane says how. */
  ready: boolean;
  profiles: BrowserProfileState[];
}

/** Where one profile's browser lives: its own complete data directory, with the seeded copy
 * inside it as the browser's ordinary "Default". One directory PER PROFILE, never one
 * directory holding several, because a browser takes a singleton lock per data directory, so
 * several profiles in one would collapse into a single browser and CDP reports no profile on
 * a target, leaving nothing able to tell which window belonged to which login. */
export function profileDataDir(id: string): string {
  return path.join(loadConfig().browser.userDataDir, id);
}

/** Everything the pane renders, reconciled against the filesystem on every read: a data
 * directory deleted by hand must show up as un-seeded rather than as a socket that never
 * opens. */
export function browserState(): BrowserState {
  const { browser } = loadConfig();
  const supported = SUPPORTED_PLATFORMS.includes(process.platform);
  const profiles = browser.profiles.map((p) => ({
    ...p,
    seeded: existsSync(path.join(browser.userDataDir, p.id, "Default")),
    installed: browserBin(p.browser) !== null,
  }));
  return {
    supported,
    unsupportedWhy: supported
      ? ""
      : `The browser pane runs on macOS and Linux. This machine is ${process.platform}, so there is nothing to mirror here yet.`,
    browserInstalled: anyBrowserInstalled(),
    browsersDeclared: Object.keys(browser.browsers).length > 0,
    sidecarPort: browser.sidecarPort,
    homeUrl: browser.homeUrl,
    searchUrl: browser.searchUrl,
    userDataDir: browser.userDataDir,
    ready: profiles.some((p) => p.seeded),
    profiles,
  };
}

export function findProfile(id: string): BrowserProfileState | null {
  return browserState().profiles.find((p) => p.id === id) ?? null;
}

/** Mint the single-use token a pane socket must present. The GRANT (which profile, and the
 * URL to open) lives in the ROW and never in the URL, so a token that leaks out of a log or
 * an address bar cannot be re-pointed at a different profile's signed-in browser. */
export function mintBrowserToken(grant: { profile: string; pane: string; url: string }): string {
  const db = getDb();
  db.prepare("DELETE FROM browser_tokens WHERE expires_at < datetime('now')").run(); // sweep
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO browser_tokens (token, profile, pane, url, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`,
  ).run(token, grant.profile, grant.pane, grant.url, `+${Math.round(TOKEN_TTL_MS / 1000)} seconds`);
  return token;
}

export interface SidecarHealth {
  up: boolean;
  /** Plain-language reason when it is not, WITH the command that fixes it. */
  why: string;
}

/** Is the browser sidecar running? Probed SERVER side, loopback to loopback, because the
 * alternative is a pane hanging forever on a socket that will never open, and a hang looks
 * like progress, which is worse than an error. */
export async function browserSidecarHealth(): Promise<SidecarHealth> {
  const port = loadConfig().browser.sidecarPort;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) }); // hub-allow-network: loopback only, this hub's own sidecar on this machine. Nothing leaves it.
    if (!res.ok) return { up: false, why: `the sidecar answered ${res.status} on port ${port}` };
    return { up: true, why: "" };
  } catch {
    return {
      up: false,
      why: `nothing is listening on 127.0.0.1:${port}. Start it with: npm run browser`, // hub-no-request: names the local address in a message, sends nothing
    };
  }
}
