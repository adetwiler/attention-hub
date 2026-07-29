// The WALL's data: config plus one filesystem probe, turned into the list of
// panes the grid renders. Server side only.
//
// It exists so that PaneGrid stays a layout component with no knowledge of
// where a pane came from, and so that the honest-state rule is held in ONE
// place rather than in every content kind:
//
//   BROKEN IS NOT EMPTY. A profile whose configDir does not exist is a config
//   MISTAKE, and the pane says which key to fix. It is never a blank pane, and
//   it is never silently dropped from the wall, because a pane that vanishes
//   teaches the user that the hub is unreliable rather than that their config
//   has a typo.
//
//   HONEST EMPTY. No profiles configured means no panes, and the room says so.
//   There is no sample pane, ever.
//   TESTABLE BY CONSTRUCTION. The import below is TYPE-ONLY on purpose, and the
//   config arrives as an argument. Node's native type stripping erases a type
//   import but does not resolve an extensionless RUNTIME one the way the bundler
//   does, so a `loadConfig` import here would make this module impossible to
//   load through test/_ts.mjs and would take the whole suite file down with it.
//   test/README.md states the rule and src/lib/migrate.ts is the precedent.
import { statSync } from "node:fs";
import type { HubConfig, PaneKind } from "./config";

/** One pane, as the grid and the content components see it. Plain data: it
 * crosses the server-to-client boundary as props. */
export interface PaneSpec {
  /** Stable id. Keys the React list, the DOM node and the focus selection. */
  id: string;
  /** What this pane holds. The content registry switches on it; the grid does not. */
  kind: PaneKind;
  /** The chip and header text. Config label, else the profile label, else the id. */
  label: string;
  /** One line of context under the label (the bound directory), or null. */
  detail: string | null;
  /** Non-null means the grid renders THIS instead of the content, in the pane's
   * own frame. Content components are never rendered for a pane in this state. */
  problem: string | null;
}

export interface WallView {
  panes: PaneSpec[];
  /** Non-null means the wall itself could not be built (an unreadable config).
   * Distinct from an empty pane list, which is a normal, honest state. */
  problem: string | null;
}

/** Why this directory cannot be used, in words a non-developer can act on. */
function dirProblem(where: string, dir: string): string | null {
  try {
    if (statSync(dir).isDirectory()) return null;
    return `${dir} is not a folder. Fix "${where}" in hub.config.json, then restart the hub.`;
  } catch {
    return `The folder ${dir} does not exist. Fix "${where}" in hub.config.json, or remove that profile, then restart the hub.`;
  }
}

/** The panes to render, given a config that already parsed. Pure. */
export function wallView(config: HubConfig): WallView {
  const { profiles, wall } = config;
  // Config order is on-screen order, both ways round: an explicit pane list is
  // taken as written, and the derived list follows the order of the profiles.
  const declared =
    wall.panes.length > 0
      ? wall.panes
      : Object.keys(profiles).map((name) => ({
          id: name,
          kind: wall.paneKind,
          profile: name,
          label: null,
          cwd: null,
        }));

  const panes = declared.map((pane, i): PaneSpec => {
    const profile = pane.profile === null ? undefined : profiles[pane.profile];
    const dir = profile?.configDir ?? null;
    return {
      id: pane.id,
      kind: pane.kind,
      label: pane.label ?? profile?.label ?? pane.id,
      detail: dir ?? pane.cwd,
      // Two ways a pane can point at a directory that is not there, and both are
      // the same class of config typo, so both name the exact key. A pane's own
      // cwd is only ever set on an explicit pane list, which is why the message
      // can name its index. The terminal module's own default cwd is checked
      // where it is used (src/lib/terminal.ts), not here: this module must stay
      // free of runtime project imports to remain loadable by the test suite.
      problem:
        (dir === null ? null : dirProblem(`profiles.${pane.profile}.configDir`, dir)) ??
        (pane.cwd === null ? null : dirProblem(`wall.panes[${i}].cwd`, pane.cwd)),
    };
  });

  return { panes, problem: null };
}

/** The wall, built through a config LOADER passed in by the caller. Never
 * throws: a config the hub cannot read is reported as a wall-level problem,
 * because a room that 500s tells the user nothing about what to change.
 *
 * Taking the loader as an argument rather than importing it is what keeps this
 * whole module loadable by the test suite (see the note at the top), and it is
 * why the unreadable-config path stays covered instead of moving into a page
 * component where no test can reach it. */
export function wallViewWith(load: () => HubConfig): WallView {
  try {
    return wallView(load());
  } catch (err) {
    return { panes: [], problem: err instanceof Error ? err.message : String(err) };
  }
}
