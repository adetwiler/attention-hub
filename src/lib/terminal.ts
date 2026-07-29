// The terminal module's rules, with no I/O and no state. It answers three
// questions and nothing else: is this module allowed to run at all, what
// exactly is this pane allowed to open, and is a token still good.
//
// WHY IT IS SHAPED THIS WAY. A browser pty is remote code execution by design,
// and on this machine it reaches your key store, your databases and your push
// credentials. Every decision that limits it therefore lives in ONE pure
// function that a test can drive: what session name, which directory, which
// shell, how long a grant lives. The route mints, the sidecar spawns, and
// neither of them decides anything.
//
//   THE CLIENT SENDS A PANE ID AND NOTHING ELSE. The working directory, the
//   session name and the shell come from config, resolved here, server side. A
//   browser cannot ask for a directory, so a stolen page cannot ask for one
//   either.
//
//   THE GRANT IS THE AUTHORITY, AND IT LIVES IN A DATABASE ROW. Single use,
//   short TTL, stored as a SHA-256 hash so the row is not itself a bearer
//   secret, and never in a URL: URLs land in history, in logs and in referrers.
//
//   OWNER ONLY, PERMANENTLY. TERMINAL_MODULE below is the manifest, the pane
//   renders it, and test/terminal.test.mjs fails if either the owner-only rule
//   or the disabled-by-default rule is flipped. It is a permanent rule, not a
//   v1 limitation.
//
// TESTABLE BY CONSTRUCTION: the config import is TYPE-ONLY and everything else
// arrives as an argument, so this module loads through test/_ts.mjs. See the
// note at the top of src/lib/wall.ts, and test/README.md for the rule.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { statSync } from "node:fs";
import type { HubConfig, TerminalConfig, WallPane } from "./config";

/** The module's own declaration of what it is and what may never change about
 * it. There is no module system yet (it is post-v1), so this const IS the
 * manifest: the pane reads it, and the test suite pins the two permanent rules.
 * When the module system lands, this becomes its manifest file unchanged. */
export const TERMINAL_MODULE = {
  id: "terminal",
  /** OFF. A stranger's first install must not come with a browser shell open. */
  enabledByDefault: false,
  /** PERMANENT. In a multi-person install no role but the owner ever gets a pty.
   * Not a v1 limitation: there is no version of this product where a second
   * person's browser session can open a shell on someone else's machine. */
  ownerOnly: true,
  /** Stated plainly. The sidecar is tmux-backed, so this is the one module the
   * repo's Windows-first-class rule does not reach. */
  platforms: ["macos", "linux"] as readonly string[],
} as const;

/** How long a minted grant is good for. Seconds, deliberately short: the browser
 * redeems it immediately, so anything longer is only useful to a thief. */
export const GRANT_TTL_SECONDS = 30;

/** One attach, fully resolved. Everything the sidecar needs and nothing it could
 * have been talked into by a client. */
export interface TerminalGrant {
  paneId: string;
  /** The tmux session name, or the raw-pty label when tmux is off. */
  session: string;
  /** Absolute. Where the shell opens. */
  cwd: string;
  /** The shell to run, or null to let the sidecar use SHELL. */
  shell: string | null;
  /** tmux-backed, so the session outlives the socket. */
  tmux: boolean;
  /** Lines of history replayed on attach. */
  scrollback: number;
  /** Minutes of silence before the socket is dropped. */
  idleMinutes: number;
}

/** Either a grant or the reason there is not one, in words a user can act on.
 * Never a throw: a pane that 500s teaches nothing about what to change. */
export type GrantResult =
  | { grant: TerminalGrant; problem: null }
  | { grant: null; problem: string };

/** Why the module itself cannot run, or null if it can. */
export function moduleProblem(terminal: TerminalConfig): string | null {
  if (!terminal.enabled) {
    return 'The terminal module is switched off. Set "terminal": { "enabled": true } in hub.config.json and restart the hub. Read docs/terminal.md first: this one gives a browser tab a real shell on this machine.';
  }
  if (process.platform === "win32") {
    return "The terminal module runs on macOS and Linux only, because the sidecar is tmux-backed. It is not built for Windows, and pretending otherwise would leave you with a pane that never connects.";
  }
  return null;
}

/** The tmux session name for a pane. `<prefix>-<pane id>`, and both halves are
 * already slugs (src/lib/config.ts enforces it), so the name can never carry a
 * dot or a colon, which tmux reads as a window or pane address. */
export function sessionName(prefix: string, paneId: string): string {
  return `${prefix}-${paneId}`;
}

/** The sidecar's WebSocket address. Loopback unless YOUR config points somewhere
 * else, because reaching the hub from another machine is a decision you make. */
export function sidecarUrl(terminal: TerminalConfig): string {
  // hub-no-request: builds the local address of your own sidecar, nothing is sent
  return terminal.url ?? `ws://127.0.0.1:${terminal.port}`;
}

/** Where a terminal pane opens: its own cwd, else the module default, else home.
 * One chain, in one place, so nothing else has to guess the order. */
export function paneCwd(pane: WallPane, terminal: TerminalConfig, homeDir: string): string {
  return pane.cwd ?? terminal.cwd ?? homeDir;
}

/** Resolve a pane id into a grant, or say exactly why not.
 *
 * Everything a client could try is refused here: an unknown pane, a pane that is
 * not a terminal, a module that is off, a directory that is not there. The
 * client's only input is the id.
 *
 * @param config the parsed hub config
 * @param paneId what the browser asked for
 * @param homeDir os.homedir(), passed in so this stays pure
 */
export function grantFor(config: HubConfig, paneId: string, homeDir: string): GrantResult {
  const off = moduleProblem(config.terminal);
  if (off !== null) return { grant: null, problem: off };

  const declared = wallPanes(config);
  const pane = declared.find((p) => p.id === paneId);
  if (pane === undefined) {
    const have = declared.map((p) => p.id).join(", ") || "none";
    return { grant: null, problem: `No pane called "${paneId}" is configured (have: ${have}).` };
  }
  if (pane.kind !== "terminal") {
    return {
      grant: null,
      problem: `The pane "${paneId}" is a ${pane.kind} pane, not a terminal. Only a terminal pane can open a shell.`,
    };
  }

  const cwd = paneCwd(pane, config.terminal, homeDir);
  const bad = dirProblem(cwd, pane.cwd === null ? "terminal.cwd" : `wall.panes[].cwd for "${paneId}"`);
  if (bad !== null) return { grant: null, problem: bad };

  return {
    grant: {
      paneId: pane.id,
      session: sessionName(config.terminal.sessionPrefix, pane.id),
      cwd,
      shell: config.terminal.shell,
      tmux: config.terminal.tmux,
      scrollback: config.terminal.scrollback,
      idleMinutes: config.terminal.idleMinutes,
    },
    problem: null,
  };
}

/** The panes config declares, derived the same way the wall derives them, so a
 * pane the wall shows is exactly a pane that can be granted. */
function wallPanes(config: HubConfig): WallPane[] {
  if (config.wall.panes.length > 0) return config.wall.panes;
  return Object.keys(config.profiles).map((name) => ({
    id: name,
    kind: config.wall.paneKind,
    profile: name,
    label: null,
    cwd: null,
  }));
}

function dirProblem(dir: string, where: string): string | null {
  try {
    if (statSync(dir).isDirectory()) return null;
    return `${dir} is not a folder. Fix "${where}" in hub.config.json, then restart the hub.`;
  } catch {
    return `The folder ${dir} does not exist. Fix "${where}" in hub.config.json, then restart the hub.`;
  }
}

// ---------------------------------------------------------------- tokens

/** A fresh grant token. 32 bytes from the OS, hex, so it is URL safe and has no
 * structure to guess. It is handed to the browser once and never stored. */
export function mintToken(): string {
  return randomBytes(32).toString("hex");
}

/** What the DATABASE holds: a hash, never the token. A stolen database file is
 * then not a stack of working shell grants, and it costs one hash to get that. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compare two hashes without leaking their difference through timing. The
 * lookup is by hash so this is belt and braces, and it is two lines. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** A token has to LOOK like one before anything is looked up: 64 hex characters.
 * A malformed value is a refusal, never a database round trip. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** When a grant minted now stops being valid, as an ISO string in UTC to match
 * how SQLite's datetime('now') writes it. */
export function grantExpiry(nowMs: number, ttlSeconds: number = GRANT_TTL_SECONDS): string {
  return new Date(nowMs + ttlSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

// ---------------------------------------------------------------- peers

/** Is this remote address the machine itself? The sidecar refuses every other
 * peer, independently of any door in front of the hub, and this is the one
 * definition of loopback the TypeScript side uses. (The sidecar carries its own
 * copy: it is a plain .mjs that runs before any TypeScript exists, the same
 * accepted duplication as the boot script's config parser. Both are covered by
 * tests, and OPEN.md records the pair.) */
export function isLoopbackAddress(address: string | null | undefined): boolean {
  if (typeof address !== "string" || address === "") return false;
  // ::ffff:127.0.0.1 is how a v6 socket reports a v4 loopback peer.
  const bare = address.startsWith("::ffff:") ? address.slice(7) : address;
  return bare === "127.0.0.1" || bare === "::1" || bare === "localhost" || /^127\./.test(bare);
}
