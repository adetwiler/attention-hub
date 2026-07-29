"use client";
// THE PANE GRID: one wall, one focus model, N kinds of content.
//
// This component owns the LAYOUT and nothing else. It knows how many panes
// there are, which of them are on screen, and how a person makes one bigger. It
// knows nothing about what a pane holds, which is the whole point: the terminal
// slice and the browser slice each add a content kind without touching this
// file, and there is never a second grid that drifts from this one.
//
// The contract, stated once here and in docs/adr/0004-pane-content-contract.md:
//
//   THE GRID OWNS the shape (from the COUNT, so four panes are a 2x2 and one
//   pane is one big pane), the focus model, fullscreen, the pane frame with its
//   header and zoom control, and the PROBLEM state.
//
//   THE CONTENT OWNS everything below the header. It is a function of the pane
//   plus a small view object (is it alone on screen, where is it, how many are
//   showing). It is NEVER rendered for a pane carrying a problem, so no content
//   kind has to re-implement the honest-error rule and get it slightly wrong.
//
// Behaviours that are deliberate, not incidental:
//   - The chips toggle a pane in or out; a pane's zoom control (or key 1 to 9)
//     solos it. The grid retemplates from the count, so pane ORDER never moves.
//   - Hiding the LAST visible pane is refused. Nothing would be left on screen
//     to undo it from.
//   - Fullscreen is feature-detected, because iOS Safari has no element
//     fullscreen and a button that does nothing is a lie.
//   - The layout is remembered per grid (focusKey), so the wall comes back the
//     way it was left.
//   - A narrow screen gets the same panes as a swipe pager with dots. It is the
//     same grid and the same focus state, not a second mobile layout.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PaneSpec } from "@/lib/wall";

/** What the content of one pane is told about its situation. Deliberately
 * small, and an object rather than positional arguments so a later slice can
 * learn something new about a pane without every caller changing. */
export interface PaneView {
  /** This pane is the only one on screen. Content may show more when true. */
  solo: boolean;
  /** Its position among the VISIBLE panes, from 0. */
  index: number;
  /** How many panes are visible right now. */
  visible: number;
}

export interface PaneGridProps {
  panes: PaneSpec[];
  /** localStorage key for the focus selection, so two grids never share one. */
  focusKey: string;
  /** Left-hand text in the bar while every pane is shown. */
  title: string;
  /** Renders one pane's body. Never called for a pane carrying a problem. */
  children: (pane: PaneSpec, view: PaneView) => ReactNode;
}

/** Lucide `maximize-2` / `minimize-2`, inlined rather than pulled from a package:
 * this repo's dependency list is part of what it is selling. currentColor so the
 * icon takes the colour of whatever it sits in. */
function ZoomIcon({ out }: { out: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {out ? (
        <>
          <path d="M15 3h6v6" />
          <path d="m21 3-7 7" />
          <path d="m3 21 7-7" />
          <path d="M9 21H3v-6" />
        </>
      ) : (
        <>
          <path d="m14 10 7-7" />
          <path d="M20 10h-6V4" />
          <path d="m3 21 7-7" />
          <path d="M4 14h6v6" />
        </>
      )}
    </svg>
  );
}

/** Lucide `maximize` / `minimize`. */
function ScreenIcon({ enter }: { enter: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {enter ? (
        <>
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </>
      ) : (
        <>
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </>
      )}
    </svg>
  );
}

/** Keys 1 to 9 solo a pane. There is no key 10, so a wall wider than nine panes
 * keeps its chips and loses only the shortcut. */
const MAX_KEYED = 9;

export default function PaneGrid({ panes, focusKey, title, children }: PaneGridProps) {
  const ids = useMemo(() => panes.map((p) => p.id), [panes]);

  // [] is the canonical "all of them", never a full list, so one layout has
  // exactly one representation and adding a pane in config cannot leave a
  // stored selection quietly hiding it.
  const [focus, setFocus] = useState<string[]>([]);
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(focusKey);
    } catch {
      return; // storage disabled: the wall still works, it just forgets
    }
    if (raw === null || raw.length === 0) return;
    // Filter against the CURRENT panes: config may have changed since.
    const want = raw.split(",").filter((id) => ids.includes(id));
    if (want.length > 0 && want.length < ids.length) setFocus(want);
  }, [focusKey, ids]);

  const setFocusStored = useCallback(
    (next: readonly string[]) => {
      // Re-derive from the declared order so on-screen order is always config
      // order, whatever order the chips happened to be clicked in.
      const clean = ids.filter((id) => next.includes(id));
      const value = clean.length === ids.length ? [] : clean;
      setFocus(value);
      try {
        if (value.length === 0) window.localStorage.removeItem(focusKey);
        else window.localStorage.setItem(focusKey, value.join(","));
      } catch {
        // storage disabled: keep the layout for this page view only
      }
    },
    [ids, focusKey],
  );

  const shown = useMemo(
    () => (focus.length === 0 ? panes : panes.filter((p) => focus.includes(p.id))),
    [panes, focus],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = shown.some((p) => p.id === id)
        ? shown.filter((p) => p.id !== id).map((p) => p.id)
        : [...shown.map((p) => p.id), id];
      if (next.length === 0) return; // an empty wall is never what was meant
      setFocusStored(next);
    },
    [shown, setFocusStored],
  );

  const solo = useCallback(
    (id: string) => {
      const alone = shown.length === 1 && shown[0]?.id === id;
      setFocusStored(alone ? ids : [id]);
    },
    [shown, ids, setFocusStored],
  );

  // ---------------------------------------------------------------- fullscreen
  const shellRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  useEffect(() => {
    // Feature-detected in an effect, never during render: the server has no
    // document, and a button rendered on the server and removed on hydration is
    // a mismatch. Detect on the ELEMENT type, because iOS Safari has document
    // fullscreen for video and no element fullscreen at all.
    setCanFull(typeof document.documentElement.requestFullscreen === "function");
    const sync = () => setFull(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = useCallback(() => {
    const el = shellRef.current;
    if (el === null || typeof el.requestFullscreen !== "function") return;
    if (document.fullscreenElement === null) void el.requestFullscreen().catch(() => undefined);
    else void document.exitFullscreen().catch(() => undefined);
  }, []);

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never steal a keystroke from something being typed into. A later slice
      // puts a live terminal in a pane, and every character there belongs to
      // the shell, so this guard is load-bearing rather than polite.
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
      ) {
        return;
      }
      const slot = Number(e.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= Math.min(panes.length, MAX_KEYED)) {
        const pane = panes[slot - 1];
        if (pane !== undefined) {
          e.preventDefault();
          solo(pane.id);
        }
        return;
      }
      // Escape while fullscreen belongs to the browser (it exits). Do not ALSO
      // restore the layout, or one Escape costs both the screen and the focus.
      if (e.key === "0" || (e.key === "Escape" && document.fullscreenElement === null)) {
        e.preventDefault();
        setFocusStored(ids);
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFull();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panes, ids, solo, setFocusStored, toggleFull]);

  // ---------------------------------------------------------------- pager
  // On a narrow screen the grid is one pane wide and scroll-snaps. On a desktop
  // it never overflows horizontally, so scrollLeft stays 0 and the dots hide.
  const gridRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const onGridScroll = useCallback(() => {
    const el = gridRef.current;
    if (el === null || el.clientWidth === 0) return;
    setPage(Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  }, []);
  const gotoPage = useCallback((i: number) => {
    const el = gridRef.current;
    const first = el?.children[0];
    const pane = el?.children[i];
    if (!(el instanceof HTMLElement) || !(first instanceof HTMLElement) || !(pane instanceof HTMLElement)) return;
    // Target the pane's exact offset (the gap shifts every pane) and assign
    // scrollLeft directly: a smooth programmatic scroll inside a mandatory-snap
    // container is cancelled by Chrome.
    el.scrollLeft = pane.offsetLeft - first.offsetLeft;
  }, []);

  if (panes.length === 0) {
    // HONEST EMPTY. No panes configured is a real state with a real answer, and
    // a sample pane here would be the exact lie this product refuses to tell.
    return (
      <section className="card note">
        <span className="hd">No panes configured</span>
        <p className="empty">
          The wall shows one pane per profile, and no profiles are configured yet. Add them
          under &quot;profiles&quot; in hub.config.json (each one is a name plus the config
          directory of that account of your AI tool), then restart the hub. Four profiles give
          you the 2x2 wall; one gives you a single big pane.
        </p>
      </section>
    );
  }

  const focused = shown.length < panes.length;
  const isSolo = shown.length === 1;

  return (
    <div className={full ? "wall isfull" : "wall"} ref={shellRef}>
      <div className="wallbar">
        <span className="walltitle">
          {focused ? `FOCUS: ${shown.map((p) => p.label).join(" / ")}` : title}
        </span>
        <span className="wallgrow" />
        <span className="fchips">
          {panes.map((pane, i) => {
            const on = shown.some((p) => p.id === pane.id);
            const key = i + 1 <= MAX_KEYED ? ` (key ${i + 1} shows it alone)` : "";
            return (
              <button
                key={pane.id}
                type="button"
                className={on ? "fchip on" : "fchip"}
                aria-pressed={on}
                title={`${on ? "hide" : "show"} the ${pane.label} pane${key}`}
                onClick={() => toggle(pane.id)}
              >
                {pane.label}
              </button>
            );
          })}
        </span>
        {canFull ? (
          <button
            type="button"
            className={full ? "fchip iconchip on" : "fchip iconchip"}
            aria-pressed={full}
            title={full ? "leave fullscreen (F or Esc)" : "fullscreen, sheds the topbar and nav (F)"}
            onClick={toggleFull}
          >
            <ScreenIcon enter={!full} />
            {full ? "EXIT" : "FULL"}
          </button>
        ) : null}
        <span className="wallkeys" aria-hidden="true">
          {panes.length > 1 ? `1-${Math.min(panes.length, MAX_KEYED)} solo / 0 all / ` : ""}F full
        </span>
      </div>

      <div className={`wallgrid n${shown.length}`} ref={gridRef} onScroll={onGridScroll}>
        {shown.map((pane, i) => (
          <div key={pane.id} className={isSolo ? "wallpane solo" : "wallpane"} data-pane-id={pane.id}>
            <div className="wallhead">
              <span className="wallname">{pane.label}</span>
              {pane.problem !== null ? <span className="wallbad">config problem</span> : null}
              <button
                type="button"
                className="wallzoom"
                title={isSolo ? "back to the wall (0)" : `show ${pane.label} alone`}
                aria-label={isSolo ? "back to the wall" : `show the ${pane.label} pane alone`}
                onClick={() => solo(pane.id)}
              >
                <ZoomIcon out={!isSolo} />
              </button>
            </div>
            <div className="wallbody">
              {/* BROKEN IS NOT EMPTY, held here so no content kind can forget it. */}
              {pane.problem !== null ? (
                <p className="empty">{pane.problem}</p>
              ) : (
                children(pane, { solo: isSolo, index: i, visible: shown.length })
              )}
            </div>
          </div>
        ))}
      </div>

      {shown.length > 1 ? (
        <div className="walldots">
          {shown.map((pane, i) => (
            <button
              key={pane.id}
              type="button"
              className={i === page ? "pdot on" : "pdot"}
              title={`${pane.label} pane`}
              aria-label={`show the ${pane.label} pane`}
              onClick={() => gotoPage(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
