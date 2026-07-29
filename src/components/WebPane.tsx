"use client";
// THE BROWSER PANE: a pane that holds a REAL browser.
//
// WHAT THIS IS NOT, AND WHY THAT MATTERS. It is not an iframe, and an iframe could never have
// worked. Measured 2026-07-29: Google, DuckDuckGo, Brave, Startpage, Ecosia and Mojeek all
// send X-Frame-Options or frame-ancestors, which is the SITE's header and something no
// browser is permitted to override. Of every engine tried, exactly one (Bing) could be framed
// at all. A pane that can only ever show the small half of the web is not a browser, and no
// amount of work on an iframe changes that.
//
// So this pane frames nothing. It shows a live picture of a real browser tab (a CDP
// screencast) and sends clicks and keystrokes back to it. Sites see an ordinary browser,
// because it IS one. That is also what makes an AI browser extension work here: the extension
// lives inside the same browser this pane is mirroring, so a session can drive the exact page
// you are looking at, which an iframe could never offer.
//
// THE ONE THING A SCREENCAST CANNOT CARRY is the browser's own UI: an extension's toolbar
// popup, a download bar, a file picker, a print dialog. Those are browser chrome, not page
// pixels. Hence the WINDOW button, which pulls the real window forward so you can reach them
// and parks it again after. That is why the browser is headful and parked off-screen rather
// than headless (measured: identical frame rate either way, so headful costs nothing).
//
// This component owns the pane BODY only. No layout, no focus model, no fullscreen, no error
// frame: those belong to PaneGrid (docs/adr/0004-pane-content-contract.md). Its props are
// deliberately self-contained so it can also be rendered on its own route, which is far
// easier to exercise against a real browser than a grid cell is.
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveInput } from "@/lib/weburl";

export interface WebPaneProps {
  /** Stable id for THIS pane. It keys the remembered profile, address and follow flag in
   * localStorage, and it is the pane id the sidecar uses to hand the same tab back on
   * reconnect, so a reload does not litter tabs. */
  pane: string;
  /** Shown in the pane's own toolbar. Optional: the grid already renders a header. */
  label?: string;
  /** Which browser profile to start on, the FIRST time. A choice made in the pane's own
   * picker is remembered and wins over this, because a pane the user pointed somewhere must
   * still be pointed there after a reload. An id with no matching profile falls back to the
   * first configured one, so this can never produce a blank pane. */
  profile?: string;
  /** Where to open, first time. Falls back to the remembered address, then to the configured
   * home page. */
  initialUrl?: string;
  /** True when this pane is the only one on screen, which is when the footer detail earns its
   * space. */
  solo?: boolean;
  /** Non-empty means the pane REFUSES to render live and prints this instead. It is the seam
   * a record or privacy mode plugs into, and it is deliberately fail-closed: a browser signed
   * into your mail and your accounts is at least as revealing as a shell, so the answer is to
   * not render, never to mask pixels over a live picture. */
  suppressed?: string | null;
  /** Called when the user presses close. Omit and no close button is rendered, which is what
   * a standalone route wants. */
  onExit?: () => void;
}

interface ProfileState {
  id: string;
  label: string;
  browser: string;
  account: string;
  seeded: boolean;
  installed: boolean;
}

interface State {
  supported: boolean;
  unsupportedWhy: string;
  browserInstalled: boolean;
  browsersDeclared: boolean;
  sidecarPort: number;
  homeUrl: string;
  searchUrl: string;
  userDataDir: string;
  ready: boolean;
  profiles: ProfileState[];
  sidecar: { up: boolean; why: string };
}

type Phase = "idle" | "opening" | "live" | "closed" | "error";

interface Tab {
  id: string;
  title: string;
  url: string;
}

interface Wire {
  type: "ready" | "frame" | "where" | "window" | "idle" | "note" | "fatal" | "tabs" | "attached" | "command";
  action?: string;
  data?: string;
  url?: string;
  title?: string;
  label?: string;
  shown?: boolean;
  message?: string;
  tabs?: Tab[];
  targetId?: string;
}

const PROFILE_KEY = (pane: string) => `hub.browser.profile.${pane}`;
const URL_KEY = (pane: string) => `hub.browser.url.${pane}`;
const FOLLOW_KEY = (pane: string) => `hub.browser.follow.${pane}`;

/** Reconnect budget after an UNEXPECTED drop (a reload, a sidecar restart, a laptop waking).
 * The browser on the far end never went anywhere, only this pane's attachment did. */
const RECONNECT_TRIES = 5;
const RECONNECT_MS = 800;

/** localStorage throws in a browser with storage disabled, and forgetting the remembered
 * address is a far better outcome than a pane that will not render. */
function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage disabled: the pane simply does not remember
  }
}

function recall(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Modifier state in the shape the sidecar wants. */
function mods(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return { alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey };
}

/** The named keys that go out as key EVENTS. Everything printable rides onBeforeInput, which
 * is the only path that gets accents, emoji and an IME's composition right. Kept in step with
 * KEYCODES in chrome/server.mjs, which ignores anything not in its own list. */
const NAMED_KEYS = [
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

export default function WebPane({
  pane,
  label,
  profile: wantProfile,
  initialUrl,
  solo = false,
  suppressed = null,
  onExit,
}: WebPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const openRef = useRef<(() => Promise<void>) | null>(null);
  const openingRef = useRef(false);
  const closedByUsRef = useRef(false);
  const retriesRef = useRef(0);
  /** The size the far end is laying the page out at. Input coordinates are in THIS space, so
   * a click lands where it was aimed no matter how the picture is scaled into the pane. */
  const viewRef = useRef({ width: 0, height: 0 });

  const [state, setState] = useState<State | null>(null);
  const [profile, setProfile] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState("");
  const [here, setHere] = useState("");
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(false);
  /** Every tab in this profile's browser, pushed by the sidecar the moment one appears. */
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [targetId, setTargetId] = useState("");
  /** FOLLOW: jump to a tab the moment it appears. This is the whole point of the tab list. An
   * AI session driving a browser works in its own tab group (creating one creates a window),
   * so following the newest tab is what puts the agent's work in the pane instead of on your
   * desktop. */
  const [follow, setFollow] = useState(false);
  /** Tab ids seen so far, so "new" means new rather than "first in the list". A ref because
   * the socket handler must compare against the latest set, not the one its closure caught. */
  const seenTabsRef = useRef<Set<string>>(new Set());
  const followRef = useRef(false);
  followRef.current = follow;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/browser"); // hub-allow-network: same-origin call to this hub's own API. Nothing leaves the machine.
        const data = (await res.json()) as State;
        if (!alive) return;
        setState(data);
        // The REMEMBERED choice first, then the prop. The other order made the wall override
        // the picker on every reload, so a pane the user had pointed at another browser
        // silently snapped back.
        const saved = recall(PROFILE_KEY(pane)) ?? wantProfile ?? null;
        const first = data.profiles.find((p) => p.seeded) ?? data.profiles[0];
        setProfile(saved !== null && data.profiles.some((p) => p.id === saved) ? saved : (first?.id ?? ""));
        setDraft(initialUrl ?? recall(URL_KEY(pane)) ?? "");
        setFollow(recall(FOLLOW_KEY(pane)) === "1");
      } catch {
        // BROKEN IS NOT EMPTY: a pane that cannot read its own state says so.
        if (alive) setNote("Could not read the browser state from the hub.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [pane, wantProfile, initialUrl]);

  const close = useCallback(() => {
    closedByUsRef.current = true;
    socketRef.current?.close();
    socketRef.current = null;
    setPhase("closed");
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    const s = socketRef.current;
    if (s !== null && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg));
  }, []);

  /** Paint a frame, sizing the canvas to the picture the far end actually sent. The canvas is
   * then fitted by CSS, so a pane resize is smooth and never re-encodes anything. */
  const paint = useCallback((b64: string) => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const img = new Image(); // hub-allow-network: decodes an inline data: URL from the loopback socket. No request is made.
    img.onload = () => {
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  }, []);

  /** Pane pixels to page pixels. The canvas is letterboxed inside the host, so the offset
   * matters as much as the scale: without it every click below the fold lands high. */
  const toPage = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (canvas === null || view.width === 0) return null;
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return {
      x: Math.round(((e.clientX - box.left) / box.width) * view.width),
      y: Math.round(((e.clientY - box.top) / box.height) * view.height),
    };
  }, []);

  const open = useCallback(
    async (startUrl?: string) => {
      if (openingRef.current || phase === "live" || suppressed !== null || profile === "") return;
      openingRef.current = true;
      closedByUsRef.current = false;
      setPhase("opening");
      setNote("");
      try {
        const res = await fetch("/api/browser/session", { // hub-allow-network: same-origin call to this hub's own API. Nothing leaves the machine.
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profile, pane, url: startUrl ?? draft }),
        });
        const grant = (await res.json()) as {
          ok: boolean;
          token?: string;
          sidecarPort?: number;
          url?: string;
          message?: string;
        };
        if (!grant.ok || grant.token === undefined || grant.sidecarPort === undefined) {
          openingRef.current = false;
          setPhase("error");
          setNote(grant.message ?? "the hub refused to open a browser");
          // KEEP TRYING WHEN THE SIDECAR IS MERELY RESTARTING. The reconnect chain below is
          // driven by socket CLOSES, but a restart fails earlier than that: the hub checks the
          // sidecar before minting and answers 503, so no socket is ever opened and the chain
          // silently ends. 503 ONLY. A 409 (not seeded), a 501 (wrong platform) or a 400 (no
          // such profile) is a fact about the world, and retrying it would just spin.
          if (res.status === 503 && !closedByUsRef.current && retriesRef.current < RECONNECT_TRIES) {
            retriesRef.current += 1;
            setNote(`The browser sidecar is restarting, retrying (${retriesRef.current}/${RECONNECT_TRIES})...`);
            window.setTimeout(() => {
              if (!closedByUsRef.current) void openRef.current?.();
            }, RECONNECT_MS * retriesRef.current);
          }
          return;
        }

        // SAME ORIGIN unless this really is loopback. Dialing 127.0.0.1 from a phone reaching
        // the hub over a private network would resolve to the PHONE, so the socket has to ride
        // the origin already in use. Only a browser genuinely on this machine's loopback dials
        // the sidecar directly, because Next proxies nothing.
        const onLoopback = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
        const scheme = window.location.protocol === "https:" ? "wss" : "ws";
        const base = onLoopback
          ? `ws://127.0.0.1:${grant.sidecarPort}/cdp` // hub-no-request: builds the loopback socket address, one line below where it is used.
          : `${scheme}://${window.location.host}/cdp`;

        // PREFLIGHT THE PATH. Without this, a proxy that does not route /cdp forwards the
        // upgrade to the Next app, which never completes the handshake and never errors
        // either, so the socket hangs open and silent and the pane says "opening..." forever.
        if (!onLoopback) {
          let routed = false;
          try {
            const probe = await fetch(`${window.location.origin}/cdp/health`, { signal: AbortSignal.timeout(4000) }); // hub-allow-network: same-origin probe of the path this hub's own sidecar is proxied on.
            routed = probe.ok && String(probe.headers.get("content-type")).includes("json");
          } catch {
            routed = false;
          }
          if (!routed) {
            openingRef.current = false;
            setPhase("error");
            setNote(
              `${window.location.host} is not forwarding /cdp to the browser sidecar, so the socket would hang instead of opening. The hub is local by default: open it on the machine it runs on, or point your reverse proxy's /cdp path at the sidecar's port (${grant.sidecarPort}).`,
            );
            return;
          }
        }

        const socket = new WebSocket(`${base}?token=${encodeURIComponent(grant.token)}`); // hub-allow-network: the pane's loopback socket to this hub's own sidecar.
        socketRef.current = socket;

        // A DEADLINE, always. A socket can connect and then sit there (a proxy that upgrades
        // but forwards nowhere). "opening..." must never be the last thing this pane says.
        const deadline = window.setTimeout(() => {
          if (socketRef.current === socket) {
            try {
              socket.close();
            } catch {
              // already gone
            }
            setPhase((p) => (p === "live" ? p : "error"));
            setNote(`The browser did not answer within 20s on ${base}`);
          }
        }, 20_000);

        socket.onmessage = (event) => {
          let msg: Wire | null = null;
          try {
            msg = JSON.parse(String(event.data)) as Wire;
          } catch {
            return;
          }
          if (msg.type === "frame" && typeof msg.data === "string") {
            paint(msg.data);
            return;
          }
          if (msg.type === "ready") {
            window.clearTimeout(deadline);
            retriesRef.current = 0;
            openingRef.current = false;
            setPhase("live");
            setNote("");
            // Tell the far end the pane's real shape immediately, so the page lays out for a
            // pane instead of for a 1440px window squeezed into a quarter of a screen.
            const host = hostRef.current;
            if (host !== null) {
              viewRef.current = { width: Math.round(host.clientWidth), height: Math.round(host.clientHeight) };
              socket.send(JSON.stringify({ type: "resize", ...viewRef.current }));
            }
          } else if (msg.type === "tabs" && Array.isArray(msg.tabs)) {
            const list = msg.tabs;
            setTabs(list);
            const seen = seenTabsRef.current;
            // A tab that did not exist a moment ago is, in practice, an agent opening its tab
            // group. Only follow it once the pane has a baseline: on the FIRST push every tab
            // is "new", and jumping then would yank you off the tab you opened.
            const fresh = seen.size > 0 ? list.find((t) => !seen.has(t.id)) : undefined;
            for (const t of list) seen.add(t.id);
            for (const id of [...seen]) if (!list.some((t) => t.id === id)) seen.delete(id);
            if (followRef.current && fresh !== undefined) {
              socket.send(JSON.stringify({ type: "attach", targetId: fresh.id }));
            }
          } else if (msg.type === "command") {
            // A SESSION ASKED FOR THIS. "Follow it" should be something an AI can do for you
            // mid-sentence, not a button you have to go and find.
            if (msg.action === "follow-on" || msg.action === "follow-off") {
              const on = msg.action === "follow-on";
              setFollow(on);
              remember(FOLLOW_KEY(pane), on ? "1" : "0");
              setNote(on ? "Following new tabs: a session asked to show you along." : "No longer following new tabs.");
            } else if (msg.action === "window" || msg.action === "park") {
              socket.send(JSON.stringify({ type: "window", show: msg.action === "window" }));
            }
          } else if (msg.type === "attached" && typeof msg.targetId === "string") {
            setTargetId(msg.targetId);
          } else if (msg.type === "where") {
            // The address box MIRRORS the tab rather than remembering what was typed, so a
            // redirect, a login bounce, a clicked link or an agent navigating all show up.
            const u = msg.url ?? "";
            setHere(u);
            setDraft(u);
            if (u.length > 0) remember(URL_KEY(pane), u);
          } else if (msg.type === "window") setShown(msg.shown === true);
          else if (msg.type === "idle") {
            setNote("Dropped for being idle. The browser is still open, reopen any time.");
          } else if (msg.type === "note") setNote(msg.message ?? "");
          else if (msg.type === "fatal") {
            setPhase("error");
            setNote(msg.message ?? "the sidecar refused");
          }
        };
        socket.onerror = () => {
          openingRef.current = false;
          setPhase("error");
          setNote(`Could not open ${base}`);
        };
        socket.onclose = (ev) => {
          window.clearTimeout(deadline);
          openingRef.current = false;
          setPhase((p) => (p === "error" ? p : "closed"));
          // The sidecar closes with a SPECIFIC code per refusal, so say which one rather than
          // guessing at a cause.
          if (ev.code === 4001) setNote("That token was already used or expired, reopening.");
          else if (ev.code === 4003) setNote("The sidecar refused a non-loopback peer.");
          else if (ev.code === 4004) setNote(`Unknown browser profile: ${String(ev.reason)}`);
          else if (ev.code === 4011) setNote("The sidecar could not check the token against the hub database.");

          const retriable = ev.code !== 1000 && ev.code !== 4008 && ev.code !== 4003 && ev.code !== 4500;
          if (retriable && !closedByUsRef.current && retriesRef.current < RECONNECT_TRIES) {
            retriesRef.current += 1;
            setNote(`Connection dropped, reconnecting (${retriesRef.current}/${RECONNECT_TRIES})...`);
            window.setTimeout(() => {
              if (!closedByUsRef.current) void openRef.current?.();
            }, RECONNECT_MS * retriesRef.current);
          }
        };
      } catch (err) {
        openingRef.current = false;
        setPhase("error");
        setNote(err instanceof Error ? err.message : String(err));
      }
    },
    [phase, suppressed, profile, pane, draft, paint],
  );

  openRef.current = () => open();

  // The far end lays the page out at the PANE's size, so focusing a pane, going fullscreen or
  // a phone rotating all re-flow the real page rather than scaling a stale picture.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let timer: number | null = null;
    const observer = new ResizeObserver(() => {
      if (timer !== null) window.clearTimeout(timer);
      // Debounced: a drag-resize would otherwise restart the screencast on every frame.
      timer = window.setTimeout(() => {
        const width = Math.round(host.clientWidth);
        const height = Math.round(host.clientHeight);
        if (width < 50 || height < 50) return;
        viewRef.current = { width, height };
        send({ type: "resize", width, height });
      }, 200);
    });
    observer.observe(host);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [send]);

  // Suppressing mid-session CLOSES the live pane rather than masking pixels over it.
  useEffect(() => {
    if (suppressed !== null && (phase === "live" || phase === "opening")) close();
  }, [suppressed, phase, close]);

  useEffect(() => close, [close]);

  const commit = useCallback(() => {
    const value = draft.trim();
    if (phase === "live") {
      send({
        type: "navigate",
        url: resolveInput(value, {
          homeUrl: state?.homeUrl ?? "",
          searchUrl: state?.searchUrl ?? "",
        }),
      });
    } else {
      void open(value);
    }
  }, [draft, phase, send, open, state]);

  if (suppressed !== null) {
    return <p className="empty">{suppressed}</p>;
  }

  const current = state?.profiles.find((p) => p.id === profile) ?? null;

  return (
    <div className="webpane">
      <div className="webbar">
        {label !== undefined && <span className="weblabel">{label}</span>}
        <button type="button" className="webchip" onClick={() => send({ type: "back" })} disabled={phase !== "live"} title="back">
          {"<"}
        </button>
        <button type="button" className="webchip" onClick={() => send({ type: "forward" })} disabled={phase !== "live"} title="forward">
          {">"}
        </button>
        <button type="button" className="webchip" onClick={() => send({ type: "reload" })} disabled={phase !== "live"} title="reload">
          reload
        </button>
        <input
          className="weburl"
          placeholder="search, or paste a URL"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // SELECT THE WHOLE ADDRESS ON FOCUS, exactly as every real browser does. Without it
          // the caret lands mid-URL and typing INSERTS: clicking here and typing "example.com"
          // spliced it into the address already there and asked DNS for a host nobody has.
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            // The address box is the ONE place typing must not reach the page.
            e.stopPropagation();
            if (e.key === "Enter") commit();
          }}
        />
        <button type="button" className="webchip" onClick={commit}>
          go
        </button>
        <select
          className="webselect"
          value={profile}
          onChange={(e) => {
            const next = e.target.value;
            setProfile(next);
            remember(PROFILE_KEY(pane), next);
            // Switching profile switches BROWSER, so the old socket has to go: these are
            // different browsers signed into different accounts, not two tabs.
            close();
            closedByUsRef.current = false;
            setPhase("idle");
          }}
          title="which browser profile, and therefore which signed-in account, this pane is mirroring"
        >
          {(state?.profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.seeded ? "" : " (not set up)"}
            </option>
          ))}
          {(state?.profiles.length ?? 0) === 0 && <option value="">(none configured)</option>}
        </select>
        {/* THE TAB LIST is how a pane follows an agent. A session driving this browser works
            in its own tab group, and the window it opens is parked off-screen by the sidecar
            the moment it appears. Picking that tab here puts the agent's work in the pane. */}
        <button
          type="button"
          className="webchip"
          onClick={() => send({ type: "newtab" })}
          disabled={phase !== "live"}
          title="open a new tab in this browser and mirror it here"
        >
          + tab
        </button>
        <select
          className="webselect"
          value={targetId}
          onChange={(e) => send({ type: "attach", targetId: e.target.value })}
          // Disabled ONLY when there is nothing to show. Requiring two tabs read as broken the
          // moment a second tab existed but its list had not been pushed yet.
          disabled={phase !== "live" || tabs.length === 0}
          title="which tab this pane mirrors, including one an AI session opened"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title.length > 0 ? t.title : t.url}
            </option>
          ))}
          {tabs.length === 0 && <option value="">(no tabs yet)</option>}
        </select>
        <button
          type="button"
          className={follow ? "webchip on" : "webchip"}
          onClick={() => {
            const next = !follow;
            setFollow(next);
            remember(FOLLOW_KEY(pane), next ? "1" : "0");
          }}
          disabled={phase !== "live"}
          title="FOLLOW: jump to any tab that opens in this browser. Turn it on before asking an AI session to drive this browser, and its tab group lands here instead of on your desktop."
        >
          follow
        </button>
        <button
          type="button"
          className="webchip"
          onClick={() => send({ type: "window", show: !shown })}
          disabled={phase !== "live"}
          title="show the real browser window: the only way to reach an extension popup, a download or a file picker, because a mirror carries page pixels and not the browser's own UI"
        >
          {shown ? "park" : "window"}
        </button>
        {onExit !== undefined && (
          <button type="button" className="webchip" onClick={onExit} title="close this browser pane">
            close
          </button>
        )}
      </div>

      <div
        className="webstage"
        ref={hostRef}
        onMouseDown={(e) => {
          const p = toPage(e);
          if (p === null) return;
          send({ type: "mouse", event: "mousePressed", ...p, button: "left", buttons: 1, clickCount: e.detail || 1, mods: mods(e) });
        }}
        onMouseUp={(e) => {
          const p = toPage(e);
          if (p === null) return;
          send({ type: "mouse", event: "mouseReleased", ...p, button: "left", buttons: 0, clickCount: e.detail || 1, mods: mods(e) });
        }}
        onMouseMove={(e) => {
          if (phase !== "live") return;
          const p = toPage(e);
          if (p === null) return;
          send({ type: "mouse", event: "mouseMoved", ...p, button: "none", buttons: e.buttons, mods: mods(e) });
        }}
        onWheel={(e) => {
          const p = toPage(e);
          if (p === null) return;
          send({ type: "wheel", ...p, deltaX: e.deltaX, deltaY: e.deltaY, mods: mods(e) });
        }}
        onKeyDown={(e) => {
          if (phase !== "live") return;
          // NAMED KEYS ONLY here; printable characters ride onBeforeInput below.
          if (!NAMED_KEYS.includes(e.key)) return;
          e.preventDefault();
          send({ type: "key", key: e.key, mods: mods(e) });
        }}
        onBeforeInput={(e) => {
          const data = (e as unknown as { data?: string }).data;
          if (phase !== "live" || typeof data !== "string" || data.length === 0) return;
          e.preventDefault();
          send({ type: "text", text: data });
        }}
        // contentEditable is what makes a div receive real text input events (including an
        // IME's), and suppressing its own rendering is what stops the typed characters from
        // ALSO appearing as stray text drawn over the picture.
        contentEditable={phase === "live"}
        suppressContentEditableWarning
        tabIndex={0}
        role="application"
        aria-label={`browser pane on ${current?.label ?? "no profile"}`}
      >
        <canvas ref={canvasRef} className="webcanvas" />
        {phase !== "live" && (
          <div className="webover">
            {phase === "opening" ? (
              <span className="dim">opening {current?.label ?? profile}...</span>
            ) : state !== null && !state.supported ? (
              <p className="empty">{state.unsupportedWhy}</p>
            ) : state !== null && !state.browsersDeclared ? (
              <p className="empty">
                No browsers are declared under <code>browser.browsers</code> in hub.config.json, so the
                hub has nothing to look for. Copy that block from hub.config.example.json, then restart
                the hub.
              </p>
            ) : state !== null && !state.browserInstalled ? (
              <p className="empty">
                No Chrome or Chromium was found at any path or command name under{" "}
                <code>browser.browsers</code> in hub.config.json. Install one, or add the path it is
                actually at.
              </p>
            ) : state !== null && state.profiles.length === 0 ? (
              <p className="empty">
                No browser profiles are configured. Add one under <code>browser.profiles</code> in
                hub.config.json, then restart the hub.
              </p>
            ) : current !== null && !current.seeded ? (
              <div className="empty">
                <strong>{current.label} needs its browser made once.</strong> Chrome has refused to be
                driven on its default data directory since Chrome 136, so the hub keeps its own copy
                instead of touching the browser you use. Quit {current.browser} completely, then run:
                <code className="webcode">node scripts/seed-browser-profile.mjs {current.id}</code>
              </div>
            ) : (
              <button type="button" className="webopen" onClick={() => void open()}>
                {phase === "error" ? "RETRY" : `OPEN ${current?.label ?? "browser"}`}
              </button>
            )}
            {note.length > 0 && <p className="empty">{note}</p>}
          </div>
        )}
      </div>

      {phase === "live" && (
        <div className="webfoot">
          {solo && current !== null && (
            <span className="dim">{current.account.length > 0 ? `${current.label} . ${current.account}` : current.label}</span>
          )}
          {shown && <span className="webwarn">the real browser window is on screen</span>}
          {note.length > 0 && <span className="webwarn">{note}</span>}
          <span className="webhere">{here}</span>
        </div>
      )}
    </div>
  );
}
