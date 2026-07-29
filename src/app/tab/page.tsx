// YOUR TABS: what they are, what you have, and how to add one.
//
// It exists because the honest empty state needs somewhere to go. A dim "+ TAB"
// in the nav with a tooltip on it is a dead end on a touch screen, and "make it
// yours" is the second thing this product promises a stranger (ADR-0003).
//
// IT IS NOT THE SETUP PAGE. Slice 8 owns that, and it covers the whole config.
// This page covers one seam, and it points at the copy-paste prompt rather than
// carrying a second copy of it: the prompt lives in prompt.txt, once, so it
// cannot drift from the config comments that are its specification.
import { loadConfig } from "@/lib/config";
import { tabsViewWith } from "@/lib/tabs";

export const dynamic = "force-dynamic";

/** The example, one line at a time, because the network gate reads one line at a
 * time and a web address in this file has to say for itself that nothing fetches
 * it. It is shown, copied by hand, and never requested by the hub. */
const EXAMPLE = [
  '"tabs": [',
  '  { "name": "YouTube", "url": "https://youtube.com" },', // hub-no-request: an example the reader copies into their own config. The hub never fetches it.
  '  { "name": "Notes",   "dir": "~/notes" }',
  "]",
].join("\n");

export default function TabsRoom() {
  const view = tabsViewWith(loadConfig);

  return (
    <>
      <div className="room-head">
        <h1>Your tabs</h1>
        <span className="room-date">
          {view.problem !== null
            ? "config problem"
            : view.tabs.length === 0
              ? "none configured"
              : `${view.tabs.length} ${view.tabs.length === 1 ? "tab" : "tabs"}`}
        </span>
      </div>

      {view.problem !== null ? (
        <section className="card note bad">
          <span className="hd">Config problem</span>
          <p className="empty">{view.problem}</p>
        </section>
      ) : (
        <section className="card">
          <span className="hd">In your nav</span>
          {view.tabs.length === 0 ? (
            // No sample row, ever. What is here is the truth: nothing yet.
            <p className="empty">
              You have no tabs yet. Nothing is missing and nothing is broken: a tab is something
              you add, and the hub does not invent one for you.
            </p>
          ) : (
            <ul className="tabdir">
              {view.tabs.map((tab) => (
                <li key={tab.slug} className="tabrow">
                  <a className="link" href={tab.href}>
                    {tab.name}
                  </a>
                  <span className="tabkind">{tab.kind === "url" ? "a web page" : "a folder"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card">
        <span className="hd">Adding one</span>
        <p className="empty">
          A tab is a name plus what it points at. Put it in <code>hub.config.json</code>, restart
          the hub, and it is in the nav. You write no code and you clone no template.
        </p>
        <pre className="doc-raw">{EXAMPLE}</pre>
        <p className="empty">
          A <code>url</code> tab opens a real browser on this machine and mirrors it here, so it
          needs the browser pane set up once. A <code>dir</code> tab lists a folder and opens what
          is in it, markdown rendered as markdown. One or the other, never both.
        </p>
        <p className="empty">
          If you would rather not edit JSON: hand <code>prompt.txt</code> to the AI tool you
          already use. It reads <code>hub.config.example.json</code>, asks you what you want, and
          writes the file. Recipes and the exact rules are in <code>docs/tabs.md</code>.
        </p>
      </section>

      <p className="version">
        Tabs are the only thing you can add to this version without writing code. Surfaces with
        code of their own wait for the module system, which is not built: updates here are a plain
        <code>git pull</code>, and until <code>user/</code> ships, edits to the hub&apos;s own
        source would collide with your next update.
      </p>
    </>
  );
}
