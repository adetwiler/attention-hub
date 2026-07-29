# The attention feed

**This is the integration surface.** Anything on your machine that can append a
line to a file can put something in front of you and read your answer back: an
AI session, a shell script, a cron job, a git hook, a program you wrote this
morning. There is no client library to install, no port to reach, and no API key.

The hub does not have to be running. A question filed at 3am is waiting when you
open the hub, which is the case that matters, because you were not there.

## Where the file is

`data/attention.jsonl` inside your hub directory, by default. To be certain:

```
hub feed
```

To put it somewhere else, set `attention.feed` in `hub.config.json`. A relative
path resolves against the hub directory and a leading `~` is expanded.

## The one rule

**Append only. No line is ever changed, moved or deleted.** An answer is a NEW
line carrying the same `id`. That is what makes it safe for your process and the
hub to use the file at the same time with no lock and no coordination: each write
is one line, and two writers interleave lines rather than characters.

If you find yourself wanting to edit a line, the thing you want is a new line.

## The two rows

### An ask row opens an item

```json
{"v":1,"id":"q-20260729-4k2p1","kind":"agent-question","at":"2026-07-29T21:03:11.482Z","from":"nightly build","ask":"The migration touches a shipped table. Add a new one instead?","options":["add a new one","edit it anyway"],"link":"notes/migration.md","prompt":"prompts/fix-migration.md"}
```

| Field | Required | What it is |
|---|---|---|
| `id` | yes | Your unique id for this item. The answer row references it. Make it readable: it appears in a terminal, in this file, and on a ledger row, and a person matches them up by eye. |
| `ask` | yes | What you are asking, in plain language. It is shown verbatim. |
| `kind` | no | `agent-question`, `agent-notice` or `review-ask`. See below. Left out, it is derived. |
| `at` | recommended | ISO 8601. The queue is oldest first by this. Left out, the item sorts oldest, so it surfaces rather than hides. |
| `from` | no | Who is asking. Shown on the item. Leave it out and nothing is shown, rather than a guess. |
| `options` | no | One-tap answers, as strings. The free text reply is always available too. |
| `link` | no | What it is about. An `http(s)` address opens a browser tab. **Anything else is treated as a file on this machine and opens inside the hub**, rendered as markdown when it is markdown. |
| `prompt` | no | A path to a ready-to-paste prompt file. The hub renders a copy button that reads the file and copies its contents. |
| `v` | no | Schema version. Absent means `1`. |

Unknown fields are ignored, so a newer writer never breaks an older hub.

### An answer row closes it

```json
{"v":1,"id":"q-20260729-4k2p1","at":"2026-07-29T21:07:40.006Z","answer":"add a new one","by":"you"}
```

A row **closes** its item when it carries either a string `answer` or
`done: true`. Nothing else closes it, which means you can append progress rows
against the same `id` (`{"id":"...","note":"still working"}`) with no risk of
accidentally answering your own question.

`done: true` with no text is how a review ask is marked handled.

## The three kinds, and why the third one exists

| Kind | Shown as | What it wants |
|---|---|---|
| `agent-question` | ASKS YOU | An answer. Something is blocked until it gets one. |
| `agent-notice` | REPORT | Nothing. It was filed for you to read and triage. |
| `review-ask` | DECIDE | A look, then "mark handled". |

**`agent-notice` is not a technicality.** A nightly run that files "three checks
went red" is not asking you anything, and a surface that labels it "asks you" is
lying in a small way, all day, until you stop believing the surface. That is a
real complaint from real use, and it is the reason this kind is in the contract
rather than being a display detail.

If you leave `kind` out, it is derived: **options or a question mark makes it a
question, and anything else is a report.** Declare it explicitly when you want to
be sure.

Marking something handled only stops the hub showing it to you. Nothing runs and
nobody is told, which is why the button says "mark handled" and not "resolve".

## Reading and ordering

- The queue is everything unanswered, **oldest first**: the thing that has waited
  longest is the thing to answer.
- The **first** ask row for an `id` defines the item. A second one with the same
  `id` is ignored, not treated as an edit.
- The **first** closing row for an `id` is the answer of record.
- A row with no `id` is ignored.
- The hub re-reads this file about every 1.5 seconds. There is no file watcher
  (see [ADR-0005](adr/0005-attention-feed-append-only-jsonl.md)) and there is no
  HTTP endpoint to post to.
- **A half written last line is normal** and is skipped in silence, because you
  may be appending as the hub reads. A broken line with rows after it is real
  damage: the hub counts those and says so on the page rather than quietly
  showing you a shorter list.
- Nothing rotates this file in v1. It is one line per item plus one per answer,
  so it grows slowly. If it ever bothers you, move the old lines somewhere else
  yourself: everything answered is history.

## The `hub` command

The CLI in this repo is a thin wrapper over the file. It exists so you do not
have to write JSON by hand, and it is not privileged in any way: everything it
does, your own script can do.

```
hub ask "Ship it as 2886, or pick another port?" --option "2886" --option "let me pick"
hub ask "The nightly run went red" --from "nightly build" --link logs/run.txt
hub review "The migration touches a shipped table" --link notes/migration.md
hub get q-20260729-4k2p1
hub get q-20260729-4k2p1 --json
hub feed
```

Options for `ask` and `review`: `--option` (repeatable), `--from`, `--link`,
`--prompt`, `--wait [seconds]`.

**The output split matters if you are scripting it.** `hub ask` prints the item
id on stdout and nothing else, so `$(hub ask "...")` is the id. Sentences for a
human go to stderr. `hub get` prints the answer text alone on stdout, so
`$(hub get "$id")` is the answer.

**Blocking on an answer** is the whole point, and it is one line:

```sh
answer=$(hub ask "Which one?" --option a --option b --wait) || echo "no answer yet"
```

`--wait` polls once a second, up to 900 seconds by default. It is a poll rather
than a watcher for the same reason the hub uses one.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Filed, or answered (and the answer is on stdout). |
| 2 | Wrong usage. The full usage is printed. |
| 3 | Still waiting. Includes a `--wait` timeout, which is deliberately not a success. |
| 4 | No such item. |
| 5 | The feed could not be read or written. |

### Putting `hub` on your PATH

From the hub directory:

```
npm link
```

That works on macOS, Linux and Windows, and it is the only step. If you would
rather not, `node /path/to/attention-hub/scripts/hub.mjs ask "..."` is exactly
equivalent, and a shell alias is fine too.

## Doing it without the CLI

The contract is the file, so any of these are first class:

```sh
printf '%s\n' '{"id":"deploy-42","kind":"review-ask","at":"'"$(date -u +%FT%TZ)"'","ask":"Deploy 42 is ready to promote"}' \
  >> "$(hub feed)"
```

```python
import json, datetime, pathlib
row = {
    "v": 1,
    "id": "import-7",
    "kind": "agent-question",
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "ask": "Two rows collide on the same key. Keep the newer one?",
    "options": ["keep newer", "keep older", "stop"],
    "from": "import script",
}
with pathlib.Path("data/attention.jsonl").open("a") as f:
    f.write(json.dumps(row) + "\n")
```

Then read the answer back by scanning the same file for a row with your `id` and
a string `answer`.

## Quiet hours

Quiet hours are **not** in this file and are not part of the contract. They live
in the hub's database because they are live state you change from the page, and
they do exactly one thing: **suppress the pop-ups.** The list is never filtered,
nothing is delayed, and when quiet lifts nothing back-fires as a pile of
notifications. Whatever arrived while it was quiet is simply in the list, oldest
first, which is where a morning starts.

The default is 22:00 to 06:00 local, it works with nothing configured, and the
switch beside the card's header is sticky: only the switch turns it off again.

## What the hub does when you answer

It appends the answer row to this file, and it records the answer as a row in the
action ledger, which is the hub's one history. So "what did I answer, and when"
is answerable later without reading the feed at all.

## What this is not

- **Not a message queue.** There is no delivery guarantee, no retry and no
  ordering promise beyond oldest first.
- **Not a notification log.** Only things that need a human belong here.
  Completions and progress belong in the ledger, and they cannot pop up.
- **Not multi machine.** It is a file on your machine, read by a hub on your
  machine. Nothing is sent anywhere, ever.
