"use client";
// The one shell every page renders inside: topbar, nav, live counts, footer.
//
// The nav matches the approved design (docs/mocks/buildwithamemory-front-page.html,
// the embedded hub screenshot): ATTENTION HUB, then TODAY / BOARD / SESSIONS /
// JOBS, with the running and queued counts on the right. TODAY is the only room
// built in this slice; the rest are marked as not built yet rather than linking
// nowhere, because a dead link is a worse lie than an honest label.
//
// AFTER the rooms come YOUR TABS, read from hub.config.json. That is v1's whole
// extension seam (ADR-0003): a name plus what it points at, no code written by
// anyone. The import below is TYPE-ONLY, which is what lets a client component
// name a type from a module that reads the filesystem.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { LedgerSnapshot } from "@/lib/stream";
import type { TabSpec } from "@/lib/tabs";
import AttentionToasts from "./AttentionToasts";
import { useLedgerStream } from "./useLedgerStream";

/** The rooms in the order the design puts them. `built` flips as slices land. */
const ROOMS: readonly { id: string; label: string; href: string; built: boolean }[] = [
  { id: "today", label: "TODAY", href: "/", built: true },
  { id: "wall", label: "WALL", href: "/wall", built: true },
  { id: "board", label: "BOARD", href: "/board", built: false },
  { id: "sessions", label: "SESSIONS", href: "/sessions", built: false },
  { id: "jobs", label: "JOBS", href: "/jobs", built: false },
];

/** What the nav says when you have no tabs: the truth, and where to write one.
 * Never a sample tab. A nav row that looks configured and is not is the exact
 * lie the honest-empty rule exists to forbid. */
const NO_TABS = 'No tabs of yours yet. Add one to "tabs" in hub.config.json: a name, plus a url or a dir. See docs/tabs.md.';

interface ShellProps {
  hubName: string;
  version: string;
  initial: LedgerSnapshot;
  /** Your config-declared tabs, in config order. Empty is the normal case. */
  tabs: TabSpec[];
  /** Non-null means the config could not be read, so the nav says so rather
   * than showing you an empty tab list that looks like a settled answer. */
  tabsProblem: string | null;
  children: ReactNode;
}

export default function Shell({ hubName, version, initial, tabs, tabsProblem, children }: ShellProps) {
  const snap = useLedgerStream(initial);
  const { running, queued } = snap.counts;
  // Which tab is lit comes from the URL, not from a hardcoded room name: with
  // more than one built room, a fixed answer marks the wrong tab.
  const here = usePathname();

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">{hubName.toUpperCase()}</span>
        <nav className="nav">
          {ROOMS.map((room) =>
            room.built ? (
              <a key={room.id} className={room.href === here ? "tab on" : "tab"} href={room.href}>
                {room.label}
              </a>
            ) : (
              <span key={room.id} className="tab off" title="Not built yet.">
                {room.label}
              </span>
            ),
          )}
          {tabs.length > 0 ? <span className="tabsep">/</span> : null}
          {tabs.map((tab) => (
            <a
              key={tab.slug}
              className={tab.href === here ? "tab mine on" : "tab mine"}
              href={tab.href}
              title={tab.kind === "url" ? "Your tab: a web page." : "Your tab: a folder on this machine."}
            >
              {tab.name.toUpperCase()}
            </a>
          ))}
          {tabsProblem !== null ? (
            <span className="tab off bad" title={tabsProblem}>
              TABS?
            </span>
          ) : tabs.length === 0 ? (
            // Clickable, not a tooltip on a dead label: the empty state is also
            // the door to the page that explains how to fill it.
            <a className={here === "/tab" ? "tab add on" : "tab add"} href="/tab" title={NO_TABS}>
              + TAB
            </a>
          ) : null}
        </nav>
        <span className="stat">
          <b>{running} running</b>
          <span className="sep">/</span>
          {queued} queued
        </span>
      </header>

      {/* Mounted HERE, once, so it is on every room. The point of the feed is
          that you find out while you are looking at something else, which cannot
          be true of a component that only exists on TODAY. It renders nothing at
          all until something arrives. */}
      <AttentionToasts initial={initial} />

      <main className="room">{children}</main>

      <footer className="foot">
        {/* Attribution is a product feature, not a licence term (ADR-0001).
            The full line and the link land with the release copy in slice 8. */}
        <span className="foot-brand">{hubName}</span>
        <span className="foot-dim">free and open source</span>
        <span className="foot-ver">v{version}</span>
      </footer>
    </div>
  );
}
