// The attention feed contract. This is the file OTHER PEOPLE'S TOOLS write to,
// so its parsing rules are the part of this repo that has to keep working
// against input nobody here controls. src/lib/feed.ts imports nothing for
// exactly this reason, which is what lets this suite load it without a database,
// a config file or a Next.js runtime.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadTs, NO_TS } from "./_ts.mjs";

const feed = await loadTs("src/lib/feed.ts");

describe("the attention feed contract", { skip: feed === null ? NO_TS : false }, () => {
  const { parseFeed, askRow, answerRow, newId } = feed ?? {};
  const lines = (...rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

  test("an empty or absent feed is an honest empty queue, not an error", () => {
    for (const text of ["", "\n\n  \n"]) {
      const read = parseFeed(text);
      assert.equal(read.open.length, 0);
      assert.equal(read.malformed, 0);
    }
  });

  test("an ask row opens an item and carries its fields through", () => {
    const read = parseFeed(
      lines({
        v: 1,
        id: "q1",
        kind: "agent-question",
        at: "2026-07-29T10:00:00.000Z",
        ask: "Ship it?",
        from: "night run",
        options: ["yes", "no"],
        link: "notes/a.md",
        prompt: "prompts/a.md",
      }),
    );
    assert.equal(read.open.length, 1);
    assert.deepEqual(read.open[0], {
      id: "q1",
      kind: "agent-question",
      source: "night run",
      ask: "Ship it?",
      at: "2026-07-29T10:00:00.000Z",
      options: ["yes", "no"],
      link: "notes/a.md",
      prompt: "prompts/a.md",
    });
  });

  test("an answer row CLOSES the item without touching the ask row", () => {
    const text = lines(
      { id: "q1", kind: "agent-question", at: "2026-07-29T10:00:00.000Z", ask: "Ship it?" },
      { id: "q1", at: "2026-07-29T10:05:00.000Z", answer: "yes", by: "you" },
    );
    const read = parseFeed(text);
    assert.equal(read.open.length, 0, "answered items leave the queue");
    assert.equal(read.all.get("q1").ask, "Ship it?", "the ask row is still readable afterwards");
    assert.deepEqual(read.answers.get("q1"), { answer: "yes", at: "2026-07-29T10:05:00.000Z", by: "you" });
  });

  test("done: true closes an item, which is how a review ask is marked handled", () => {
    const read = parseFeed(
      lines(
        { id: "r1", kind: "review-ask", at: "2026-07-29T10:00:00.000Z", ask: "Look at this" },
        { id: "r1", at: "2026-07-29T11:00:00.000Z", done: true },
      ),
    );
    assert.equal(read.open.length, 0);
    assert.equal(read.answers.get("r1").answer, "");
  });

  test("the FIRST close wins, and the first ask row defines the item", () => {
    const read = parseFeed(
      lines(
        { id: "q1", ask: "first wording?", at: "2026-07-29T10:00:00.000Z" },
        { id: "q1", ask: "second wording?", at: "2026-07-29T10:01:00.000Z" },
        { id: "q1", answer: "one", at: "2026-07-29T10:02:00.000Z" },
        { id: "q1", answer: "two", at: "2026-07-29T10:03:00.000Z" },
      ),
    );
    assert.equal(read.all.get("q1").ask, "first wording?");
    assert.equal(read.answers.get("q1").answer, "one");
  });

  test("a row that is neither an ask nor a close changes nothing", () => {
    // This is what lets a writer append progress against an id without any risk
    // of accidentally closing the item.
    const read = parseFeed(
      lines(
        { id: "q1", ask: "Ship it?", at: "2026-07-29T10:00:00.000Z" },
        { id: "q1", note: "still thinking", at: "2026-07-29T10:01:00.000Z" },
        { id: "q1", answered: true, at: "2026-07-29T10:02:00.000Z" },
      ),
    );
    assert.equal(read.open.length, 1, "only answer or done:true closes an item");
  });

  test("the queue is OLDEST FIRST, and ties keep file order", () => {
    const read = parseFeed(
      lines(
        { id: "b", ask: "second?", at: "2026-07-29T12:00:00.000Z" },
        { id: "a", ask: "first?", at: "2026-07-29T09:00:00.000Z" },
        { id: "c", ask: "tie one?", at: "2026-07-29T12:00:00.000Z" },
      ),
    );
    assert.deepEqual(
      read.open.map((i) => i.id),
      ["a", "b", "c"],
    );
  });

  test("a kind is DERIVED when the row does not declare one", () => {
    const read = parseFeed(
      lines(
        { id: "a", ask: "Is this a question?", at: "2026-07-29T09:00:00.000Z" },
        { id: "b", ask: "Nightly run went red", at: "2026-07-29T09:01:00.000Z" },
        { id: "c", ask: "Pick one", options: ["x", "y"], at: "2026-07-29T09:02:00.000Z" },
      ),
    );
    // A report must never wear "asks you", which is the whole reason the third
    // kind exists: a wall of rows claiming to ask you things that are not asking
    // you is how a needs-you surface stops being believed.
    assert.equal(read.open[0].kind, "agent-question", "a question mark asks");
    assert.equal(read.open[1].kind, "agent-notice", "no options and no question mark is a report");
    assert.equal(read.open[2].kind, "agent-question", "options ask, with or without a question mark");
  });

  test("an unknown declared kind falls back to the derived one", () => {
    const read = parseFeed(lines({ id: "a", kind: "wat", ask: "Ship it?", at: "2026-07-29T09:00:00.000Z" }));
    assert.equal(read.open[0].kind, "agent-question");
  });

  test("a torn LAST line is silent, and a broken line anywhere else is counted", () => {
    const good = JSON.stringify({ id: "a", ask: "Ship it?", at: "2026-07-29T09:00:00.000Z" });
    const torn = parseFeed(`${good}\n{"id":"b","ask":"half writ`);
    assert.equal(torn.open.length, 1);
    assert.equal(torn.malformed, 0, "a half written last line is a normal append in flight");

    const corrupt = parseFeed(`{"id":"b","ask":"half writ\n${good}\n`);
    assert.equal(corrupt.malformed, 1, "a broken line with rows after it is real damage");
    assert.equal(corrupt.open.length, 1, "the readable rows are still read");
  });

  test("unknown fields are ignored, so a newer writer cannot break an older hub", () => {
    const read = parseFeed(
      lines({ v: 99, id: "a", ask: "Ship it?", at: "2026-07-29T09:00:00.000Z", severity: "high", tags: ["x"] }),
    );
    assert.equal(read.open.length, 1);
  });

  test("a row with no id belongs to no item and is not corruption", () => {
    const read = parseFeed(lines({ ask: "who am I?" }, { hello: "world" }));
    assert.equal(read.open.length, 0);
    assert.equal(read.malformed, 0);
  });

  test("a missing timestamp sorts oldest rather than being dropped", () => {
    const read = parseFeed(
      lines({ id: "a", ask: "dated?", at: "2026-07-29T09:00:00.000Z" }, { id: "b", ask: "undated?" }),
    );
    assert.deepEqual(
      read.open.map((i) => i.id),
      ["b", "a"],
    );
  });

  test("askRow and answerRow round trip through the parser", () => {
    const text =
      askRow({ id: "q9", kind: "agent-question", ask: "Ship it?", options: ["yes"], from: "me" }) +
      answerRow("q9", "yes", "you");
    const read = parseFeed(text);
    assert.equal(read.open.length, 0);
    assert.equal(read.answers.get("q9").answer, "yes");
    assert.equal(read.all.get("q9").source, "me");
  });

  test("a serialized row is exactly ONE line, which is what makes appends safe", () => {
    const row = askRow({ id: "q9", kind: "agent-question", ask: "Ship\nit?" });
    assert.equal(row.split("\n").length, 2, "the only newline is the terminator");
    assert.ok(row.endsWith("\n"));
    assert.equal(parseFeed(row).open[0].ask, "Ship\nit?", "a newline in the text survives as an escape");
  });

  test("empty optional fields are omitted rather than written as empty strings", () => {
    const row = JSON.parse(askRow({ id: "q9", kind: "review-ask", ask: "Look", from: "", options: [], link: null }));
    assert.deepEqual(Object.keys(row).sort(), ["ask", "at", "id", "kind", "v"]);
  });

  test("an id is readable and deterministic given its inputs", () => {
    const id = newId("q", new Date("2026-07-29T10:00:00.000Z"), () => 0.5);
    assert.match(id, /^q-20260729-[0-9a-z]{5}$/);
  });
});
