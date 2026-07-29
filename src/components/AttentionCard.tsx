"use client";
// WAITING FOR YOU. The top card on TODAY, and the reason the product is called
// what it is: the one place that says whether anything actually needs you.
//
// Everything unanswered, OLDEST FIRST, each row still carrying its own answer,
// so a night's queue is triage by tapping rather than a hunt through four tools.
//
// PAGINATED AT THREE, and the count in the header stays honest. That number came
// from use: a long queue rendered inline turned the landing page into a wall, and
// the first thing you did was scroll past it. Paging is DISPLAY ONLY. Nothing is
// filtered, nothing is re-ranked, the total is always shown, and answering an
// item on page four just makes the list shorter.
//
// The list is DATA, so quiet hours never touch it. The quiet state renders on the
// header, honestly, and the schedule sits behind an expander rather than in a
// settings page: it is the one knob this card owns.
import { useState } from "react";
import type { LedgerSnapshot } from "@/lib/stream";
import { ItemMeta, KindTag } from "./AttentionBits";
import { AttentionLink, PromptCopy } from "./AttentionFiles";
import InlineAnswer from "./InlineAnswer";
import { useLedgerStream } from "./useLedgerStream";

/** Three rows a page. */
const PAGE_SIZE = 3;

export default function AttentionCard({ initial }: { initial: LedgerSnapshot }) {
  const snap = useLedgerStream(initial);
  const quiet = snap.quiet;
  const [note, setNote] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [knobs, setKnobs] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // An answered item vanishes on the next stream tick, up to 1.5 seconds away.
  // This closes that gap so a row you just answered does not sit there looking
  // unanswered, WITHOUT lying: it only ever hides an item the server confirmed.
  const [answered, setAnswered] = useState<string[]>([]);
  const items = snap.attention.filter((item) => !answered.includes(item.id));

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const finish = (id: string, message: string): void => {
    setAnswered((seen) => [...seen, id]);
    setNote(message);
  };

  /** Both quiet controls POST to the same endpoint, and both render whatever it
   * says rather than assuming it worked. */
  const postQuiet = async (payload: Record<string, unknown>): Promise<Response | null> => {
    try {
      const res = await fetch("/api/attention/quiet", { // hub-allow-network: same-origin POST to this hub's own route. Nothing leaves the machine.
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { message?: string };
      setNote(data.message ?? (res.ok ? "Saved." : "That was refused."));
      return res;
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const saveHours = async (): Promise<void> => {
    setSaving(true);
    setNote(null);
    const res = await postQuiet({ start: start ?? quiet.start, end: end ?? quiet.end });
    if (res !== null && res.ok) {
      setStart(null); // the stream's value is the truth again
      setEnd(null);
    }
    setSaving(false);
  };

  const quietLabel = quiet.quietNow
    ? quiet.manual
      ? "quiet, by the switch"
      : `quiet until ${quiet.end}`
    : `quiet ${quiet.start} to ${quiet.end}`;

  return (
    <section className={items.length > 0 ? "card needs" : "card"}>
      <span className="hd">
        <span className="dot" />
        Waiting for you
        <button type="button" className="hd-btn" onClick={() => setKnobs((open) => !open)}>
          {quietLabel}
        </button>
        {items.length > 0 ? <span className="count">{items.length}</span> : null}
      </span>

      {knobs ? (
        <div className="item">
          <div className="answer-row">
            <button type="button" className="btn" onClick={() => void postQuiet({ manual: !quiet.manual })}>
              {quiet.manual ? "turn quiet off" : "turn quiet on now"}
            </button>
            <span className="answer-hint">Sticky. Only this switch turns it back off.</span>
          </div>
          <div className="answer-row">
            <span className="answer-hint">quiet from</span>
            <input
              className="answer-input time"
              aria-label="Quiet hours start"
              value={start ?? quiet.start}
              onChange={(e) => setStart(e.target.value)}
              placeholder="22:00"
            />
            <span className="answer-hint">to</span>
            <input
              className="answer-input time"
              aria-label="Quiet hours end"
              value={end ?? quiet.end}
              onChange={(e) => setEnd(e.target.value)}
              placeholder="06:00"
            />
            <button type="button" className="btn go" disabled={saving} onClick={() => void saveHours()}>
              {saving ? "saving..." : "save"}
            </button>
          </div>
          <p className="empty">
            Daily, in 24 hour local times. While it is quiet nothing pops up and
            everything still lands in this list, so a morning starts here rather
            than with a pile of notifications.
          </p>
        </div>
      ) : null}

      {note !== null ? <p className="empty">{note}</p> : null}

      {items.length === 0 ? (
        <p className="empty">
          Nothing needs you right now. When one of your sessions hits a question,
          or files something for you to look at, it lands here and pops up unless
          it is quiet.
        </p>
      ) : (
        <>
          {visible.map((item) => (
            <div key={item.id} className="item">
              <span className="item-head">
                <KindTag kind={item.kind} />
                <ItemMeta source={item.source} at={item.at} nowMs={snap.nowMs} />
              </span>
              <span className="ask">{item.ask}</span>
              {item.link !== null ? (
                <span className="item-file">
                  <AttentionLink id={item.id} link={item.link} />
                </span>
              ) : null}
              {item.prompt !== null ? (
                <span className="item-file">
                  <PromptCopy id={item.id} />
                </span>
              ) : null}
              <InlineAnswer item={item} onDone={(message) => finish(item.id, message)} />
            </div>
          ))}

          {items.length > PAGE_SIZE ? (
            <div className="pager">
              <button type="button" className="btn" disabled={current === 0} onClick={() => setPage(current - 1)}>
                previous
              </button>
              <span className="who">
                page {current + 1} of {pageCount}, {items.length} waiting, oldest first
              </span>
              <button
                type="button"
                className="btn"
                disabled={current >= pageCount - 1}
                onClick={() => setPage(current + 1)}
              >
                next
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
