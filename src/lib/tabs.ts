// TABS: config turned into the nav entries and the one room behind them.
//
// This is the whole of v1's extension seam (ADR-0003). A tab is a name plus what
// it points at, and this module is the only place that decides what that means
// on screen. Server side only.
//
// Three rules it exists to hold in ONE place:
//
//   HONEST EMPTY. No tabs configured is not a problem to report and not a place
//   for a sample row. The nav says no tab is configured, and that is the end of
//   it.
//
//   BROKEN IS NOT EMPTY. A tab pointing at a folder that is not there still
//   appears in the nav, and its room says which key in hub.config.json to fix.
//   A tab that silently vanishes teaches the user the hub is unreliable rather
//   than that their config has a typo.
//
//   THE FOLDER COMES FROM CONFIG, THE PATH INSIDE IT COMES FROM THE REQUEST.
//   Those two are never the same thing. `?path=` is joined onto the tab's own
//   folder and the result has to still be inside it, symlinks resolved, or
//   nothing is read. So a tab can only ever show you what you pointed it at.
//
// TESTABLE BY CONSTRUCTION. The config import below is TYPE-ONLY and the config
// arrives as an argument, exactly as in src/lib/wall.ts. Node's native type
// stripping erases a type import but does not resolve an extensionless RUNTIME
// one the way the bundler does, so a `loadConfig` import here would make this
// module impossible to load through test/_ts.mjs and would take the whole suite
// file down with it. The same rule is why markdown is NOT rendered here: this
// module reports that a file is markdown and the page calls the renderer.
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { HubConfig, HubTab } from "./config";

/** Files up to this size open in place. The same number as the attention feed's
 * document viewer (src/lib/attention.ts), which is the other surface in this hub
 * that shows you a file, deliberately duplicated rather than imported: see the
 * type-stripping note above. */
const FILE_MAX_BYTES = 512 * 1024;

/** How many entries of one folder are rendered. A notes folder with nine
 * thousand files in it should not build a nine thousand row page, and saying
 * "showing the first 500 of 9123" is honest where quietly truncating is not. */
const LISTING_MAX = 500;

/** One tab as the NAV sees it. Deliberately carries nothing path-like: the nav
 * is a client component, and where your folders are is not something it needs. */
export interface TabSpec {
  slug: string;
  name: string;
  /** Where it lives in the hub. */
  href: string;
  kind: "url" | "dir";
}

export interface TabsView {
  tabs: TabSpec[];
  /** Non-null means the CONFIG could not be read at all, so the nav says so
   * instead of pretending the user has no tabs. Distinct from an empty list,
   * which is the normal, honest state. */
  problem: string | null;
}

/** One row of a folder tab's listing. */
export interface TabEntry {
  name: string;
  kind: "dir" | "file";
  /** The link that opens it, inside the hub. */
  href: string;
}

/** A file being read in place. `markdown` is a fact about the file, not a
 * rendering: the page owns the renderer (src/lib/markdown.ts). */
export interface TabFile {
  name: string;
  text: string;
  markdown: boolean;
}

/** Everything the tab room renders. */
export interface TabRoomView {
  /** null means there is no tab at this address, and the room says so. */
  tab: TabSpec | null;
  /** A url tab's address, for the browser pane. null for a folder tab. */
  url: string | null;
  /** Where you are inside a folder tab, relative to its own folder. "" is its root. */
  here: string;
  /** The folder tab's own folder, shown so it is obvious what the tab is bound to. */
  root: string | null;
  entries: TabEntry[];
  /** How many entries the folder actually holds, when more than LISTING_MAX. */
  truncatedFrom: number | null;
  file: TabFile | null;
  /** The link back up one level, or null at the tab's root. */
  up: string | null;
  /** Something is wrong with what this tab points at, in words that name the fix. */
  problem: string | null;
}

function specOf(tab: HubTab): TabSpec {
  return {
    slug: tab.slug,
    name: tab.name,
    href: `/tab/${encodeURIComponent(tab.slug)}`,
    kind: tab.url === null ? "dir" : "url",
  };
}

/** The nav entries. Pure: it touches no filesystem, because the nav renders on
 * every request of every page and a broken folder is the ROOM's story to tell. */
export function tabsView(config: HubConfig): TabsView {
  return { tabs: config.tabs.map(specOf), problem: null };
}

/** The nav entries, through a config LOADER passed in by the caller. Never
 * throws: a config the hub cannot read is reported, because a nav that 500s
 * takes down every page in the hub including the one explaining the mistake. */
export function tabsViewWith(load: () => HubConfig): TabsView {
  try {
    return tabsView(load());
  } catch (err) {
    return { tabs: [], problem: err instanceof Error ? err.message : String(err) };
  }
}

/** Why this folder cannot be used, in words a non-developer can act on. The
 * wall says a parallel thing about a profile's configDir (src/lib/wall.ts), with
 * its own remedy, and the two are separate on purpose: neither module may import
 * the other without breaking the test loader, and "remove that tab" is not
 * "remove that profile". */
function dirProblem(where: string, dir: string): string | null {
  try {
    if (statSync(dir).isDirectory()) return null;
    return `${dir} is not a folder. Fix "${where}" in hub.config.json, then restart the hub.`;
  } catch {
    return `The folder ${dir} does not exist. Fix "${where}" in hub.config.json, or remove that tab, then restart the hub.`;
  }
}

/** Where a requested path lands inside a tab's folder, or null when it would
 * leave it. Symlinks are resolved on BOTH sides before comparing, so a link
 * inside the folder cannot be used to read the rest of the disk, and the check
 * is a real containment check rather than a string prefix.
 *
 * A path that does not exist yet is not an escape, it is a miss, so it resolves
 * lexically and is reported as missing by the caller. */
function inside(base: string, relative: string): string | null {
  // The caller has already established that the base folder exists, so this
  // cannot be the reason nothing renders.
  const root = realpathSync(base);
  const target = path.resolve(root, relative);
  let real = target;
  try {
    real = realpathSync(target);
  } catch {
    // Not on disk. Lexical containment still decides whether we may look.
  }
  if (real === root) return real;
  return real.startsWith(root + path.sep) ? real : null;
}

/** The rows of one folder, folders first then files, each ordered the way a
 * person reads a list. Nothing is hidden: a dotfile in your notes folder is a
 * file in your notes folder. */
function listing(dir: string, slug: string, here: string): { entries: TabEntry[]; total: number } {
  const raw = readdirSync(dir, { withFileTypes: true });
  const sorted = raw
    .map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? ("dir" as const) : ("file" as const),
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  const entries = sorted.slice(0, LISTING_MAX).map((entry) => ({
    ...entry,
    href: `/tab/${encodeURIComponent(slug)}?path=${encodeURIComponent(here === "" ? entry.name : `${here}/${entry.name}`)}`,
  }));
  return { entries, total: sorted.length };
}

/** Read one file for display, or say why not. Never throws. */
function readFile(full: string, shown: string): { file: TabFile | null; problem: string | null } {
  const stat = statSync(full);
  if (stat.size > FILE_MAX_BYTES) {
    return {
      file: null,
      problem: `${shown} is ${Math.round(stat.size / 1024)}KB, and the hub shows files up to ${FILE_MAX_BYTES / 1024}KB in place.`,
    };
  }
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { file: null, problem: `${shown} could not be read: ${detail}` };
  }
  // A NUL byte means this is not text, and a screenful of replacement characters
  // is a worse answer than saying so. The hub is not an image viewer yet.
  if (text.includes("\u0000")) {
    return { file: null, problem: `${shown} is not a text file, so there is nothing to show here.` };
  }
  const name = path.basename(full);
  return { file: { name, text, markdown: /\.(md|markdown)$/i.test(name) }, problem: null };
}

const EMPTY: Omit<TabRoomView, "tab"> = {
  url: null,
  here: "",
  root: null,
  entries: [],
  truncatedFrom: null,
  file: null,
  up: null,
  problem: null,
};

/** One tab's room: what it points at, resolved. `relative` is whatever arrived
 * in `?path=`, and it is only ever used to walk INSIDE the tab's own folder.
 *
 * Pure in the sense that matters: it reads the filesystem and nothing else, it
 * takes the already-parsed config, and it never throws. */
export function tabRoom(config: HubConfig, slug: string, relative: string): TabRoomView {
  const tab = config.tabs.find((t) => t.slug === slug);
  if (tab === undefined) return { ...EMPTY, tab: null };
  const spec = specOf(tab);

  if (tab.url !== null) return { ...EMPTY, tab: spec, url: tab.url };
  const dir = tab.dir ?? "";

  const where = `tabs[${config.tabs.indexOf(tab)}].dir`;
  const bad = dirProblem(where, dir);
  if (bad !== null) return { ...EMPTY, tab: spec, root: dir, problem: bad };

  // Normalised so "notes/../.." is refused as one answer rather than depending
  // on how many segments deep the walk went.
  const asked = relative.replace(/^\/+/, "");
  const full = inside(dir, asked);
  if (full === null) {
    return {
      ...EMPTY,
      tab: spec,
      root: dir,
      problem: `That path is outside ${dir}, and a tab only ever shows you what it points at.`,
    };
  }

  let stat;
  try {
    stat = statSync(full);
  } catch {
    return { ...EMPTY, tab: spec, root: dir, problem: `${asked} is not in ${dir} (any more).` };
  }

  const here = asked === "" ? "" : asked.replace(/\/+$/, "");
  const parent = here.includes("/") ? here.slice(0, here.lastIndexOf("/")) : "";
  const up =
    here === ""
      ? null
      : parent === ""
        ? `/tab/${encodeURIComponent(slug)}`
        : `/tab/${encodeURIComponent(slug)}?path=${encodeURIComponent(parent)}`;

  if (stat.isDirectory()) {
    try {
      const { entries, total } = listing(full, slug, here);
      return {
        ...EMPTY,
        tab: spec,
        root: dir,
        here,
        entries,
        truncatedFrom: total > entries.length ? total : null,
        up,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ...EMPTY, tab: spec, root: dir, here, up, problem: `That folder could not be read: ${detail}` };
    }
  }

  const shown = here === "" ? path.basename(full) : here;
  const { file, problem } = readFile(full, shown);
  return { ...EMPTY, tab: spec, root: dir, here, file, up, problem };
}

/** One tab's room, through a config loader passed in by the caller. Same reason
 * as tabsViewWith: an unreadable config is a message on the page, not a 500. */
export function tabRoomWith(load: () => HubConfig, slug: string, relative: string): TabRoomView {
  try {
    return tabRoom(load(), slug, relative);
  } catch (err) {
    return { ...EMPTY, tab: null, problem: err instanceof Error ? err.message : String(err) };
  }
}
