---
name: ask-the-human
description: Put a question, a report or a review request in front of the human through the Attention Hub, and read the answer back. Use when you are blocked on a decision only they can make, when you have finished something they said they wanted to see, when you found something they should look at, or when they say "ask me", "file that for me", "put it in the hub", or "let me know when". Also use it to read an answer to something already filed.
---

# Ask the human through the hub

The person you are working with runs the Attention Hub. It is the one place
things that need them gather, and it pops up wherever they are in it. Filing an
item there is better than one of the two things you would otherwise do: stop and
wait in a conversation they are not reading, or guess and carry on.

## Before you file anything

**One item, one thing.** Two questions in one item cannot be answered with one
answer, and the person will answer half of it.

**Ask the smallest answerable question.** Give options when you genuinely have
them: a two-tap answer gets answered in a way a paragraph does not. Do not invent
options to look tidy, and never make up an option you would not act on.

**Do not file what you can find out.** If reading the code, the git history, the
docs or running a command answers it, do that instead. This channel is for
product intent, taste, a decision with consequences, or state outside the
machine.

## Filing

```
hub ask "<the question>" [--option "<one tap>"]... [--from "<who you are>"] [--link "<path or url>"] [--prompt "<path>"]
hub review "<what to look at>" [--from "..."] [--link "..."]
```

If `hub` is not on their PATH, run it directly:
`node <path-to-attention-hub>/scripts/hub.mjs ask "..."`. Find the hub directory
once (they cloned it somewhere; `hub feed` prints the file it uses) and reuse it.

Pick the verb by what you want back:

| You want | Use | Shown to them as |
|---|---|---|
| An answer, because you are blocked | `hub ask` with a question mark, and options if you have them | ASKS YOU |
| Nothing, you are reporting something | `hub ask` with a plain statement, no question mark | REPORT |
| A look, then a "handled" | `hub review` | DECIDE |

The third column is not cosmetic. A statement filed as a question makes the hub
claim something is asking them when nothing is, and enough of those and they stop
trusting the surface. Write a report as a statement, deliberately.

Always pass `--from` with something that identifies you usefully (the repo, the
task, the script). It is shown on the item, and "who is asking" is most of the
context.

Pass `--link` when there is something to look at: a note, a log, a diff you
wrote. A path (not an `http` address) opens INSIDE the hub, and markdown renders
as markdown, so a written summary is genuinely readable there. Prefer writing
your findings to a markdown file and linking it over pasting a wall of text into
the ask.

Pass `--prompt` when the useful next step is something they should run: the hub
gives them a copy button for the file's contents.

## Waiting for the answer

```
answer=$(hub ask "Which one?" --option "a" --option "b" --from "$repo" --wait)
```

`--wait` blocks until they answer, up to 900 seconds, then prints the answer
alone on stdout. Exit code 0 means answered, 3 means still waiting (including a
timeout), so you can branch on it.

Only wait when you truly cannot continue. If there is other useful work, file the
item WITHOUT `--wait`, note the id, do the other work, and read the answer later:

```
id=$(hub ask "..." --from "$repo")
# ... other work ...
hub get "$id"          # exit 0 with the answer, or exit 3 while still waiting
hub get "$id" --json   # the whole record, if you need the options or the kind
```

**Never treat a timeout as consent.** Exit 3 means they have not answered. Say
that plainly and stop, or take the reversible path and say which you took.

## After they answer

Do what they said. If the answer changes a decision that lives in the project's
memory (an ADR, a topic doc, a convention), write it down there in the same pass:
the answer is the durable part, and a decision that only exists in a JSONL file
will be re-asked.

## The one honesty rule

Do not file something as needing them when it does not. Every false alarm makes
the real one less likely to be seen, and this channel only works while every item
in it is worth the interruption.
