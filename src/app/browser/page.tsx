// THE BROWSER PANE, on its own page.
//
// The pane's home is a cell of the wall, and it renders there through the content registry
// (src/components/paneContent.tsx). This route exists anyway, and it is not a debug leftover:
//
//   1. A full-width browser is genuinely the shape you want sometimes, and this is the one
//      place the mirror gets the whole screen without hiding the rest of the wall.
//   2. It is FAR easier to exercise against a real browser than a grid cell is. Every trap in
//      docs/browser-pane.md is a thing that only shows up against real Chrome, so the pane has
//      to be reachable on its own, with nothing else on the page that could be blamed.
//
// It renders exactly the same component with exactly the same props, so nothing here can drift
// from what the wall shows.
import WebPane from "@/components/WebPane";

export const dynamic = "force-dynamic";

export default function BrowserRoom() {
  return (
    <div className="room">
      <div className="room-head">
        <h1>Browser</h1>
        <span className="room-date">a real browser, mirrored</span>
      </div>
      <div className="card webroom">
        <WebPane pane="standalone" solo />
      </div>
      <p className="version">
        This is not a page inside a frame. It is a picture of a real browser tab on this
        machine, with your clicks and keystrokes forwarded to it, which is why sites that
        refuse to be framed work here. The browser it drives is the hub&apos;s own copy of a
        profile: Chrome has refused to be debugged on its default data directory since Chrome
        136, so the browser you have open is never touched. See docs/browser-pane.md.
      </p>
    </div>
  );
}
