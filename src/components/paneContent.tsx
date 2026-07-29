"use client";
// THE PANE CONTENT REGISTRY: one row per kind, and that is the whole seam.
//
// Adding a kind of pane to the hub is two edits and no new layout code:
//   1. add the name to `PaneKind` in src/lib/config.ts,
//   2. add its row here.
// The Record over the union makes step 2 non-optional: a missing row is a
// compile error, so a kind can never be accepted by config and then render
// nothing on screen. Why it is shaped this way: docs/adr/0004-pane-content-contract.md.
//
// A content component gets the pane and a small view object, and owns the pane
// BODY only. The frame, the header, the focus model and the problem state
// belong to PaneGrid, so nothing here has to re-implement them.
import type { ComponentType } from "react";
import type { PaneKind } from "@/lib/config";
import type { PaneSpec } from "@/lib/wall";
import type { PaneView } from "./PaneGrid";
import TerminalPane from "./TerminalPane";

export interface PaneContentProps {
  pane: PaneSpec;
  view: PaneView;
}

/** The only kind this version can render. It is not a sample and it is not a
 * mock: it says what the pane is bound to and what it is waiting for, which is
 * exactly true, and it makes the grid itself usable today. */
function PlaceholderPane({ pane }: PaneContentProps) {
  return (
    <div className="paneplaceholder">
      <p className="empty">
        Nothing is rendering in this pane yet. The wall around it works: press its number
        key to blow it up on its own, 0 to bring them all back, F for fullscreen.
      </p>
      {pane.detail !== null ? (
        <p className="panebound">
          Bound to <code>{pane.detail}</code>
        </p>
      ) : null}
    </div>
  );
}

/** A kind config accepts but this version cannot draw. Saying so is the point:
 * a config written for a later release loads, and the pane that is waiting
 * names itself instead of the hub refusing the whole file or going blank. */
function NotBuiltPane({ pane }: PaneContentProps) {
  return (
    <p className="empty">
      This pane is set to <code>{pane.kind}</code>, and this version of the hub cannot
      render that kind yet. Set its kind to <code>placeholder</code> in hub.config.json, or
      update the hub once that pane ships.
    </p>
  );
}

/** Every kind, mapped. Exhaustive by type. */
export const PANE_CONTENT: Record<PaneKind, ComponentType<PaneContentProps>> = {
  placeholder: PlaceholderPane,
  // A real shell on this machine, through the pty sidecar. Ships switched OFF
  // (terminal.enabled) and the pane says so rather than showing a dead button.
  // docs/terminal.md and docs/adr/0005-terminal-sidecar-and-its-trust-model.md.
  terminal: TerminalPane,
  // Owned by the browser slice: a mirrored Chrome tab for this account.
  browser: NotBuiltPane,
};
