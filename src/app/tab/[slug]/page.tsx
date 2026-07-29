// ONE OF YOUR TABS. The room behind a row you wrote in hub.config.json.
//
// This page is deliberately thin, exactly like the wall: src/lib/tabs.ts resolves
// the tab and reads what it points at, and this file renders it. Nothing about
// where a tab may point is decided here.
//
// A url tab renders through the browser pane that already ships (ADR-0006), so
// this slice added no new way for the hub to reach the network: the pane mirrors a
// real browser on this machine and the hub itself fetches nothing.
//
// A folder tab lists the folder and opens a file in place, markdown rendered as
// markdown, which is the same promise the attention feed's documents make:
// nothing throws you out of the hub.
import WebPane from "@/components/WebPane";
import { loadConfig } from "@/lib/config";
import { renderMarkdown } from "@/lib/markdown";
import { tabRoomWith } from "@/lib/tabs";

export const dynamic = "force-dynamic";

/** Next 16 hands both of these over as promises. */
interface TabPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `?path=` twice is a mistake, not two answers, so the first one wins. */
function firstValue(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

export default async function TabRoom({ params, searchParams }: TabPageProps) {
  const { slug } = await params;
  const view = tabRoomWith(loadConfig, slug, firstValue((await searchParams)["path"]));

  // No tab at this address, and no config problem either: the address is simply
  // not one of yours. Saying which file names tabs beats a bare 404.
  if (view.tab === null) {
    return (
      <>
        <div className="room-head">
          <h1>No such tab</h1>
          <span className="room-date">nothing is configured here</span>
        </div>
        <section className="card note bad">
          <span className="hd">Nothing at this address</span>
          <p className="empty">
            {view.problem ??
              `There is no tab called "${slug}" in your config. Tabs come from "tabs" in hub.config.json, and editing it takes effect on the next restart.`}
          </p>
        </section>
      </>
    );
  }

  const { tab } = view;

  return (
    <>
      <div className="room-head">
        <h1>{tab.name}</h1>
        <span className="room-date">{tab.kind === "url" ? "a web page, in a real browser" : "a folder on this machine"}</span>
      </div>

      {view.problem !== null ? (
        // BROKEN IS NOT EMPTY. The tab stays in the nav and this says which key
        // to fix, because a tab that disappears reads as an unreliable hub.
        <section className="card note bad">
          <span className="hd">This tab cannot show you that</span>
          <p className="empty">{view.problem}</p>
          {view.up !== null ? (
            <p className="empty">
              <a className="link" href={view.up}>
                back
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      {tab.kind === "url" && view.url !== null ? (
        <>
          <div className="card webroom">
            {/* The pane id is per tab, so the address and profile it remembers belong
                to THIS tab and nothing else. The configured url is where it opens. */}
            <WebPane pane={`tab-${tab.slug}`} initialUrl={view.url} solo />
          </div>
          <p className="version">
            This tab opens <code>{view.url}</code> in a real browser on this machine and mirrors
            it here, which is why sites that refuse to be framed work. It needs a browser profile
            set up once (see docs/browser-pane.md) and the sidecar running: <code>npm run browser</code>.
          </p>
        </>
      ) : null}

      {tab.kind === "dir" && view.problem === null ? (
        <section className="card">
          <span className="hd">
            {view.here === "" ? (view.root ?? "") : view.here}
            {view.file === null ? (
              <span className="count">
                {view.entries.length} {view.entries.length === 1 ? "item" : "items"}
              </span>
            ) : null}
          </span>

          {view.up !== null ? (
            <p className="tabup">
              <a className="link" href={view.up}>
                up one level
              </a>
            </p>
          ) : null}

          {view.file !== null ? (
            view.file.markdown ? (
              // The HTML comes from src/lib/markdown.ts, which escapes every `<` in
              // the source BEFORE parsing, so the only tags here are ones the parser
              // emitted. Read that file's header before changing this line.
              <div className="doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(view.file.text) }} />
            ) : (
              <pre className="doc-raw">{view.file.text}</pre>
            )
          ) : view.entries.length === 0 ? (
            <p className="empty">This folder is empty.</p>
          ) : (
            <ul className="tabdir">
              {view.entries.map((entry) => (
                <li key={entry.name} className={entry.kind === "dir" ? "tabrow isdir" : "tabrow"}>
                  <a className="link" href={entry.href}>
                    {entry.kind === "dir" ? `${entry.name}/` : entry.name}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {view.truncatedFrom !== null ? (
            <p className="empty">
              Showing the first {view.entries.length} of {view.truncatedFrom}. The rest are in the
              folder, not in this list.
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="version">
        This tab is a row in your <code>hub.config.json</code>, not code. <a className="link" href="/tab">
          How tabs work
        </a>
        .
      </p>
    </>
  );
}
