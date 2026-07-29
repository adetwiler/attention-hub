"use client";
// WAITING FOR YOU. The top card on TODAY, and the reason the product is called
// what it is: the one place that says whether anything actually needs the human.
//
// Slice 1 renders the EMPTY state honestly. There is no attention queue yet, so
// the card says nothing is waiting, which is true. It never shows a sample row.
// Slice 2 fills the list; the shape it will render is already on the stream
// (LedgerSnapshot.attention), so nothing about this component's contract moves.
import type { LedgerSnapshot } from "@/lib/stream";
import { useLedgerStream } from "./useLedgerStream";

export default function AttentionCard({ initial }: { initial: LedgerSnapshot }) {
  const items = useLedgerStream(initial).attention;

  return (
    <section className={items.length > 0 ? "card needs" : "card"}>
      <span className="hd">
        <span className="dot" />
        Waiting for you
        {items.length > 0 ? <span className="count">{items.length}</span> : null}
      </span>

      {items.length === 0 ? (
        <p className="empty">
          Nothing needs you right now. When an agent hits a question, or something
          finishes that you asked to see, it lands here.
        </p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="item">
            <span className="who">
              {item.kind} / {item.source}
            </span>
            <span className="ask">{item.ask}</span>
          </div>
        ))
      )}
    </section>
  );
}
