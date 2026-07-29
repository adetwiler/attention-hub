// THE WALL. Every configured pane on one screen, side by side.
//
// The shape comes from the count of configured panes: four give the 2x2, one
// gives a single big pane, eight give an eight-pane wall. That is a config
// choice in hub.config.json, never a code change.
//
// This page is deliberately thin. It resolves the panes (src/lib/wall.ts) and
// hands plain data to the client grid. Nothing about what a pane HOLDS is
// decided here: that is the content registry, src/components/paneContent.tsx.
import Wall from "@/components/Wall";
import { loadConfig } from "@/lib/config";
import { wallViewWith } from "@/lib/wall";

export const dynamic = "force-dynamic";

export default function WallRoom() {
  // The loader is passed IN rather than imported by wall.ts, so that module
  // stays free of runtime project-internal imports and therefore stays testable.
  const view = wallViewWith(loadConfig);

  return (
    <div className="wallroom">
      <div className="room-head">
        <h1>The wall</h1>
        <span className="room-date">
          {view.problem === null && view.panes.length > 0
            ? `${view.panes.length} ${view.panes.length === 1 ? "pane" : "panes"}`
            : "not configured"}
        </span>
      </div>

      {view.problem !== null ? (
        // A config the hub cannot read is a BROKEN wall, not an empty one, and
        // the message names the exact key to fix because the loader's whole
        // vocabulary is "name the place in the file".
        <section className="card note bad">
          <span className="hd">Config problem</span>
          <p className="empty">{view.problem}</p>
        </section>
      ) : (
        <Wall panes={view.panes} />
      )}
    </div>
  );
}
