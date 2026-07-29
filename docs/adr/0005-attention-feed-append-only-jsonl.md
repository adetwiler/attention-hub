# ADR-0005: the attention feed is an append-only file, polled

Status: accepted, 2026-07-29. Implemented by slice 2 (issue #2).

## Context

The hub's reason to exist is that something needs you and you are somewhere else.
So the first question of the whole product is: how does a thing that needs you
TELL the hub?

Whatever the answer is, it becomes the product's public integration surface, and
it is the part hardest to change later, because other people's tools will be
written against it. The candidates were an HTTP endpoint on the hub, a row
written directly into the hub's SQLite database, a socket, and a file.

## Decision

**One append-only JSONL file, whose path comes from config, which the hub re-reads
on its existing 1.5 second stream tick.** Answers are appended as new rows and no
row is ever rewritten. The full contract is
[docs/attention-feed.md](../attention-feed.md).

Five parts, each of which is the actual decision:

**1. A file, not an HTTP endpoint.** An endpoint means the hub has to be RUNNING
for a session to file a question. That is exactly backwards: the question is most
valuable when you are not there, and "not there" and "hub not running" overlap
heavily. It also means every writer needs the port, needs to handle a connection
refusal, and needs to decide what to do with a question it could not deliver. A
file has none of those failure modes, and the integration instructions for any
language on earth are "append a line".

**2. Append only, so there is no lock.** One write of one newline terminated line
is atomic enough for this purpose on every platform we support: two writers
interleave lines, never characters. The moment the design allows rewriting a row,
a reader can see a half rewritten line, and both processes need a lock protocol
they would have to agree on. Answers therefore APPEND, and the reader's rules
(first ask row wins, first closing row wins) are what make that unambiguous.

**3. Polled, not watched.** A filesystem watcher is a per-platform reliability
problem (network shares, editors that write by rename, Windows semantics, missed
events under load) and the thing it buys is latency below human perception. The
stream already ticks every 1.5 seconds for the ledger, so the feed read costs one
`stat` per tick and one parse per actual change.

**4. Not a table in the hub's database.** `src/lib/db.ts` states that only the
web process opens SQLite, and that single-writer rule is what makes WAL safe here
and keeps the helper scripts dependency free. Letting arbitrary sessions write to
the database would trade a documented boundary for a locking problem, and it would
mean a writer needs `better-sqlite3`, which is a native module that has to build.
The feed is a text file precisely so a shell one-liner is a first class client.

**5. The answer is still a ledger row.** Answering is a hub MUTATION, so it goes
through `runThroughLedger()` like everything else, which keeps the one-history
rule intact. The feed is the transport; the ledger is the record.

## Consequences

Good:

- A stranger integrates in one line, in any language, with no dependency.
- Questions survive the hub being closed, restarted or updated.
- The whole feature is inspectable and repairable with a text editor, which is
  worth a great deal in a product with no telemetry: when someone reports a
  problem, they can read their own file and tell us what is in it.
- The CLI is a convenience, not a privileged client, so there is no shape a
  session can file that a user's own script cannot.

Costs, accepted:

- **Up to 1.5 seconds of latency.** Fine for a human.
- **No rotation in v1.** The file grows by one line per item and one per answer.
  It is stated in the contract, with the honest advice that everything answered is
  history and can be moved elsewhere by hand.
- **Two implementations of two small rules.** The CLI must run on Node 20, where
  importing a `.ts` file fails, so "where is the feed" and "what counts as
  answered" exist in both `scripts/hub.mjs` and `src/lib/`. This is the same
  tradeoff `scripts/serve.mjs` already made for the config, and it is handled the
  same way: `test/hub-cli.test.mjs` runs both implementations over the same input
  and fails if they disagree. Not a comment asking people to remember.
- **No delivery guarantees.** Deliberately. It is a queue of things for one human
  on one machine, not a message bus, and the contract says so out loud.

## Related

- [ADR-0002](0002-hub-architecture.md) for the config-versus-state split this
  follows: the feed's PATH is registry (config), quiet hours are live state
  (SQLite).
- [docs/attention-feed.md](../attention-feed.md) is the contract itself.
