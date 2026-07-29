"use client";
// THE ANSWER, wherever the item is showing. One component, rendered identically
// on a toast and on the WAITING FOR YOU card.
//
// That is the product's central claim made into code: an attention item is
// ANSWERABLE IN PLACE. Not a link to a page where you can answer it, not a
// notification that something is waiting elsewhere. The controls are on the
// thing itself, so unblocking a stuck agent costs one click and no navigation.
//
// It is one component and not two because two would drift. A chip layout that
// exists only on the card, or a text field that only the toast has, means the
// same item behaves differently depending on where you happened to see it, and
// nobody would ever describe that as intentional out loud.
//
// Failure renders inline and honestly. "It was answered somewhere else" is a
// normal thing to hear when you have two tabs open, and it is much better than a
// button that silently does nothing.
import { useState } from "react";
import type { AttentionItem } from "@/lib/feed";

interface InlineAnswerProps {
  item: AttentionItem;
  /** Called on success, with the hub's own plain-language message. The parent
   * drops the item from its surface: the stream confirms within one tick, and
   * this closes the gap so a row you just answered does not sit there. */
  onDone: (message: string) => void;
}

export default function InlineAnswer({ item, onDone }: InlineAnswerProps) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (payload: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attention/answer", { // hub-allow-network: same-origin POST to this hub's own route. Nothing leaves the machine.
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (data.ok === true) onDone(data.message ?? "Done.");
      else setError(data.message ?? "The hub refused that, and did not say why.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const answer = (text: string): void => {
    if (text.trim().length === 0) return;
    void post({ id: item.id, answer: text });
  };

  // A review ask has one control, and its label is "mark handled" rather than
  // "resolve" on purpose: all it does is stop the hub showing you the item.
  // Nothing runs and nobody is told, and "resolve" reads like a promise that
  // the problem itself was dealt with.
  if (item.kind === "review-ask") {
    return (
      <div className="answer">
        <div className="answer-row">
          <button type="button" className="btn go" disabled={busy} onClick={() => void post({ id: item.id, handled: true })}>
            {busy ? "marking..." : "Mark handled"}
          </button>
          <span className="answer-hint">It leaves the list. Nothing else happens.</span>
        </div>
        {error !== null ? <p className="answer-err">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="answer">
      {item.options.length > 0 ? (
        <div className="answer-row">
          {item.options.map((option) => (
            <button key={option} type="button" className="chip" disabled={busy} onClick={() => answer(option)}>
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {/* The free text line is ALWAYS available, even when there are chips: the
          options are what the asker imagined, and the answer is sometimes
          neither of them. */}
      <div className="answer-row">
        <input
          className="answer-input"
          value={reply}
          disabled={busy}
          aria-label={item.kind === "agent-notice" ? "A note about this report" : "Your answer"}
          // A notice is a report, so the words say so. The same row lands in the
          // file either way, and the only difference is honesty.
          placeholder={item.kind === "agent-notice" ? "a note, if you want one..." : "your answer..."}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") answer(reply);
          }}
        />
        <button type="button" className="btn go" disabled={busy || reply.trim().length === 0} onClick={() => answer(reply)}>
          {busy ? "sending..." : item.kind === "agent-notice" ? "Noted" : "Answer"}
        </button>
      </div>

      {error !== null ? <p className="answer-err">{error}</p> : null}
    </div>
  );
}
