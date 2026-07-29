"use client";
// An attention item's two file references, and the standing rule they obey:
// NOTHING THROWS YOU OUT OF THE HUB.
//
// A `link` that is an http address is genuinely somewhere else, so it opens a
// tab. Anything else is a FILE ON THIS MACHINE, and clicking it opens it HERE,
// over whatever you were reading, rendered as markdown when it is markdown. The
// alternative is what this replaces: clicking a note in a list and landing on a
// browser page showing raw markdown source, having lost the list.
//
// A `prompt` is a file whose whole purpose is to be pasted somewhere, so it gets
// a copy button rather than a viewer. That is the pattern the field exists for:
// "remind me when this matters, and when it fires, hand me the exact prompt to
// run." A reminder that makes you go and find the prompt has done half a job.
//
// Both go through ONE endpoint, and neither of them ever names a path: they name
// the ITEM, and the server resolves the path out of the feed. See
// src/app/api/attention/doc/route.ts for why that is the guard.
import { useState } from "react";

interface DocResult {
  ok: boolean;
  message: string;
  name: string;
  html: string | null;
  text: string;
}

async function fetchDoc(id: string, which: "link" | "prompt"): Promise<DocResult> {
  const res = await fetch("/api/attention/doc", { // hub-allow-network: same-origin POST to this hub's own route. Nothing leaves the machine.
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, which }),
  });
  return (await res.json()) as DocResult;
}

/** An item's link. A web address keeps the tab; a file opens in place. */
export function AttentionLink({ id, link }: { id: string; link: string }) {
  const [doc, setDoc] = useState<DocResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (/^https?:\/\//.test(link)) {
    // hub-no-request: renders a link the USER may click. Nothing is fetched here.
    return (
      <a className="link" href={link} target="_blank" rel="noreferrer">
        {link}
      </a>
    );
  }

  const open = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchDoc(id, "link");
      if (result.ok) setDoc(result);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="link file"
        title={`${link}, opens here`}
        disabled={busy}
        onClick={() => void open()}
      >
        {link}
      </button>
      {error !== null ? <span className="answer-err">{error}</span> : null}
      {doc !== null ? <DocFloat doc={doc} onClose={() => setDoc(null)} /> : null}
    </>
  );
}

/** The document, over the page. Markdown renders as markdown, because a raw
 * dump of a file you asked to READ is not the same as showing it to you. */
function DocFloat({ doc, onClose }: { doc: DocResult; onClose: () => void }) {
  return (
    <div className="float-back" role="presentation" onClick={onClose}>
      <div
        className="float"
        role="dialog"
        aria-label={doc.name}
        onClick={(e) => {
          e.stopPropagation(); // a click inside the document must not close it
        }}
      >
        <div className="float-head">
          <span className="float-name">{doc.name}</span>
          <button type="button" className="btn" onClick={onClose}>
            close
          </button>
        </div>
        {doc.html !== null ? (
          // The HTML comes from src/lib/markdown.ts, which escapes every `<` in
          // the source BEFORE parsing, so the only tags here are ones the parser
          // emitted. Read that file's header before changing this line.
          <div className="doc" dangerouslySetInnerHTML={{ __html: doc.html }} />
        ) : (
          <pre className="doc-raw">{doc.text}</pre>
        )}
      </div>
    </div>
  );
}

/** An item's ready-to-paste prompt. Reads the file and copies its contents. */
export function PromptCopy({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const copy = async (): Promise<void> => {
    setState("busy");
    setError(null);
    try {
      const result = await fetchDoc(id, "prompt");
      if (!result.ok) {
        setError(result.message);
        setState("idle");
        return;
      }
      await navigator.clipboard.writeText(result.text);
      setState("done");
      window.setTimeout(() => setState("idle"), 4000);
    } catch (err) {
      // A clipboard write can be refused by the browser, and silently swallowing
      // that would leave someone pasting whatever they had before.
      setError(err instanceof Error ? err.message : String(err));
      setState("idle");
    }
  };

  return (
    <>
      <button type="button" className="btn" disabled={state === "busy"} onClick={() => void copy()}>
        {state === "done" ? "prompt copied" : state === "busy" ? "reading..." : "copy the prompt"}
      </button>
      {error !== null ? <span className="answer-err">{error}</span> : null}
    </>
  );
}
