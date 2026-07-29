"use client";
// The wall room's client half: it holds the render prop, and that is all it is
// for. A server component cannot pass a function to a client component, so the
// pane list is computed on the server (src/lib/wall.ts, plain data) and the
// "how do I draw this kind" decision lives here, one lookup deep.
//
// A later slice that adds a content kind changes paneContent.tsx and nothing in
// this file.
import PaneGrid from "./PaneGrid";
import { PANE_CONTENT } from "./paneContent";
import type { PaneSpec } from "@/lib/wall";

/** One localStorage key for this wall's focus selection. Any other grid in the
 * hub passes its own, so two walls can never share one layout. */
const FOCUS_KEY = "hub.wall.focus";

export default function Wall({ panes }: { panes: PaneSpec[] }) {
  const title = panes.length === 1 ? "THE WALL: 1 PANE" : `THE WALL: ${panes.length} PANES`;

  return (
    <PaneGrid panes={panes} focusKey={FOCUS_KEY} title={title}>
      {(pane, view) => {
        const Content = PANE_CONTENT[pane.kind];
        return <Content pane={pane} view={view} />;
      }}
    </PaneGrid>
  );
}
