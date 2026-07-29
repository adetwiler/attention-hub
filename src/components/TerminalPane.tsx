"use client";
// A LIVE SHELL IN ONE PANE OF THE WALL.
//
// It owns the pane BODY and nothing else. The frame, the header, the focus model,
// fullscreen and the config-problem state all belong to PaneGrid, which is why
// this file has no layout in it at all. See docs/adr/0004-pane-content-contract.md.
//
// THREE THINGS ABOUT THE SHAPE OF THIS COMPONENT ARE DELIBERATE.
//
//   IT DOES NOT CONNECT BY ITSELF. Opening the wall must not open four shells,
//   and a shell that appears without being asked for is the wrong default for
//   the most powerful surface in the product. So there is a button, and the
//   pane says what pressing it does.
//
//   IT SENDS THE TOKEN AS THE FIRST MESSAGE, NEVER IN THE URL. A URL goes into
//   browser history, proxy logs and referrer headers, and a single-use token in
//   a log is still a token.
//
//   IT SAYS WHAT IS WRONG. Every refusal from the hub and the sidecar arrives as
//   a sentence and is rendered as one: the module is off, the sidecar is not
//   running, tmux is missing, the grant expired. BROKEN IS NOT EMPTY applies to
//   a pane that cannot connect just as much as to a surface with no data.
//
// xterm is imported lazily inside the effect rather than at the top of the file
// because it touches the DOM on import, and this component is rendered by a
// server-rendered page.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { PaneContentProps } from "./paneContent";
import "@xterm/xterm/css/xterm.css";

/** What the pane is doing, in the user's words rather than the socket's. */
type Phase = "idle" | "opening" | "live" | "closed" | "problem";

interface Note {
  phase: Phase;
  /** One sentence, always actionable. Never a raw exception. */
  message: string;
}

/** The mint response, narrowed by hand: it crosses a network boundary, so it is
 * `unknown` until proven otherwise. */
interface Grant {
  token: string;
  url: string;
  session: string;
  cwd: string;
  tmux: boolean;
  idleMinutes: number;
}

function readGrant(value: unknown): { grant: Grant; problem: null } | { grant: null; problem: string } {
  if (typeof value !== "object" || value === null) return { grant: null, problem: "The hub sent an answer this pane could not read." };
  const raw = value as Record<string, unknown>;
  if (raw["ok"] !== true) {
    const problem = typeof raw["problem"] === "string" ? raw["problem"] : "The hub refused to open a terminal.";
    return { grant: null, problem };
  }
  const token = raw["token"];
  const url = raw["url"];
  if (typeof token !== "string" || typeof url !== "string") {
    return { grant: null, problem: "The hub sent a grant with no token in it." };
  }
  return {
    grant: {
      token,
      url,
      session: typeof raw["session"] === "string" ? raw["session"] : "",
      cwd: typeof raw["cwd"] === "string" ? raw["cwd"] : "",
      tmux: raw["tmux"] === true,
      idleMinutes: typeof raw["idleMinutes"] === "number" ? raw["idleMinutes"] : 0,
    },
    problem: null,
  };
}

/** The hub's dark palette, so the shell looks like part of the product rather
 * than a white box dropped into it. The values come from globals.css. */
const THEME = {
  background: "#1c120a",
  foreground: "#f2e9d7",
  cursor: "#f5a94b",
  cursorAccent: "#100a06",
  selectionBackground: "rgba(245, 169, 75, 0.25)",
};

export default function TerminalPane({ pane }: PaneContentProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const grantRef = useRef<Grant | null>(null);
  const [note, setNote] = useState<Note>({
    phase: "idle",
    message: "",
  });
  const [detail, setDetail] = useState<string | null>(null);

  /** Tear everything down. Closing the socket detaches tmux, which leaves the
   * session running: that is the whole point of it being tmux-backed. */
  const teardown = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  /** The button's version of the same thing, which also has to SAY what it did:
   * detaching a tmux-backed session leaves it running, and that is the sentence
   * that stops someone thinking they lost their work. */
  const detach = useCallback(() => {
    const tmux = grantRef.current?.tmux === true;
    teardown();
    setNote({
      phase: "closed",
      message: tmux
        ? "Detached. The session is still running, here and from a real terminal, so reattaching picks it up where it was."
        : "Detached, and with no tmux behind it that ended the shell.",
    });
  }, [teardown]);

  /** Is the module even switched on? Asked WITHOUT minting anything, so a pane
   * can say "this is off, and here is what turning it on means" before anyone
   * presses a button. Silence from this check is not treated as a failure: the
   * attach attempt reports the real problem. */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`/api/terminal/session?paneId=${encodeURIComponent(pane.id)}`); // hub-allow-network: same-origin, the hub's own route, nothing leaves the machine
        const body: unknown = await response.json();
        if (!live || typeof body !== "object" || body === null) return;
        const raw = body as Record<string, unknown>;
        if (raw["ready"] === true) return;
        if (typeof raw["problem"] === "string") setNote({ phase: "problem", message: raw["problem"] });
      } catch {
        // leave the pane in its idle state; ATTACH will say what is wrong
      }
    })();
    return () => {
      live = false;
    };
  }, [pane.id]);

  const connect = useCallback(async () => {
    // Exactly one terminal per pane, ever. Without this a REATTACH after a drop
    // stacks a second xterm inside the same host element and the pane grows a
    // duplicate cursor.
    teardown();
    setNote({ phase: "opening", message: "asking the hub for a grant..." });
    setDetail(null);

    let answer: unknown;
    try {
      const response = await fetch("/api/terminal/session", { // hub-allow-network: same-origin, the hub's own route, nothing leaves the machine
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paneId: pane.id }),
      });
      answer = await response.json();
    } catch {
      setNote({ phase: "problem", message: "The hub did not answer the request for a grant. Is it still running?" });
      return;
    }
    const minted = readGrant(answer);
    if (minted.problem !== null) {
      setNote({ phase: "problem", message: minted.problem });
      return;
    }
    const grant = minted.grant;
    grantRef.current = grant;

    const host = hostRef.current;
    if (host === null) return;

    // Lazily loaded: xterm touches the DOM at import time, and this component is
    // rendered by a server-rendered page.
    const [{ Terminal: Xterm }, { FitAddon: Fit }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
    const term = new Xterm({
      convertEol: false,
      cursorBlink: true,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new Fit();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const socket = new WebSocket(grant.url); // hub-allow-network: the loopback pty sidecar on this machine, see docs/terminal.md
    wsRef.current = socket;

    socket.addEventListener("open", () => {
      // THE TOKEN GOES IN THE FIRST MESSAGE. Not the URL: see the header.
      socket.send(
        JSON.stringify({ type: "attach", token: grant.token, cols: term.cols, rows: term.rows }),
      );
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null) return;
      const frame = msg as Record<string, unknown>;
      if (frame["type"] === "data" && typeof frame["data"] === "string") {
        term.write(frame["data"]);
        return;
      }
      if (frame["type"] !== "status") return;
      const message = typeof frame["message"] === "string" ? frame["message"] : "";
      const state = frame["state"];
      if (state === "attached") {
        setNote({ phase: "live", message });
        setDetail(typeof frame["session"] === "string" ? frame["session"] : null);
        term.focus();
      } else if (state === "warn") {
        // A warning is not a failure: the shell works, something about it is
        // worse than it should be, and the pane says which.
        setNote({ phase: "live", message });
      } else if (state === "error") {
        setNote({ phase: "problem", message });
      } else {
        setNote({ phase: "closed", message });
      }
    });

    socket.addEventListener("close", () => {
      // Only speak if nothing more specific has been said. A close after an
      // "error" or "idle" status would otherwise overwrite the real reason.
      setNote((current) =>
        current.phase === "live"
          ? {
              phase: "closed",
              message: grant.tmux
                ? "The connection closed. The session is still running, so reattaching picks it up where it was."
                : "The connection closed, and with no tmux that ended the shell.",
            }
          : current,
      );
    });

    socket.addEventListener("error", () => {
      setNote({
        phase: "problem",
        message:
          "Could not reach the terminal sidecar. Start it with: cd pty && npm install && npm start (docs/terminal.md has the service files that keep it running).",
      });
    });

    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
    });

    term.onResize(({ cols, rows }) => {
      // The sidecar IGNORES this for a tmux-backed session, deliberately: the
      // smallest attached client would otherwise resize every other one, which
      // is how a phone destroys a desk layout. Sent anyway, because a raw pty
      // has exactly one client and should fit.
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols, rows }));
    });
  }, [pane.id, teardown]);

  // Refit when the pane changes size (a solo, a fullscreen, a window drag).
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // a zero-size pane during a layout change: the next tick fits it
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const live = note.phase === "live";

  return (
    <div className="termpane">
      <div className="termbar">
        <span className={live ? "termstate on" : "termstate"}>
          {live ? "LIVE" : note.phase === "opening" ? "OPENING" : note.phase === "problem" ? "PROBLEM" : "NOT ATTACHED"}
        </span>
        {detail !== null ? <code className="termsession">{detail}</code> : null}
        <span className="termgrow" />
        <button
          type="button"
          className="termbtn"
          disabled={note.phase === "opening"}
          onClick={live ? detach : () => void connect()}
        >
          {live ? "DETACH" : note.phase === "closed" || note.phase === "problem" ? "REATTACH" : "ATTACH"}
        </button>
      </div>

      {note.message !== "" ? <p className={note.phase === "problem" ? "termnote bad" : "termnote"}>{note.message}</p> : null}

      {note.phase === "idle" ? (
        <p className="empty">
          Nothing is attached. ATTACH opens a real shell on this machine, in{" "}
          <code>{pane.detail ?? "your home directory"}</code>, and anything you type there runs
          as you. The session is kept by tmux, so leaving this page does not stop it.
        </p>
      ) : null}

      {/* The host element is never unmounted while a terminal exists: the last
          screen of a dropped session is what tells you what happened to it. */}
      <div className={note.phase === "idle" || note.phase === "problem" ? "termhost hidden" : "termhost"} ref={hostRef} />
    </div>
  );
}
