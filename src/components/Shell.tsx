"use client";
// The one shell every page renders inside: topbar, nav, live counts, footer.
//
// The nav matches the approved design (docs/mocks/buildwithamemory-front-page.html,
// the embedded hub screenshot): ATTENTION HUB, then TODAY / BOARD / SESSIONS /
// JOBS, with the running and queued counts on the right. TODAY is the only room
// built in this slice; the rest are marked as not built yet rather than linking
// nowhere, because a dead link is a worse lie than an honest label.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { LedgerSnapshot } from "@/lib/stream";
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

interface ShellProps {
  hubName: string;
  version: string;
  initial: LedgerSnapshot;
  children: ReactNode;
}

export default function Shell({ hubName, version, initial, children }: ShellProps) {
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
