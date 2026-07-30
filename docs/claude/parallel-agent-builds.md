# Building several slices at once

The v1 slices are large and mostly independent, so more than one agent works
this repo at the same time. That is only safe because of four rules. Break any
one of them and two agents throw away each other's work.

## 1. A claimed issue carries the `in-progress` label

An agent picking work takes the lowest-numbered open issue whose blockers are
closed, **skipping anything labelled `in-progress` or `post-v1`**. The label is
the claim. It goes on before the work starts and comes off when the branch is
merged or abandoned.

Any automated dispatcher that feeds this repo carries the same rule in its
brief. An idle run costs nothing. A duplicated one costs a night.

## 2. Every agent works in its own git worktree

Never the main checkout. The main checkout is for reading, orienting and
merging. A shared checkout means a branch switched underneath a running edit,
a cross-contaminated index, and a commit that quietly contains someone else's
half-finished file.

## 3. Install the gates in the worktree, every time

The denylist is machine local and is deliberately not committed, so a fresh
worktree correctly refuses every commit until you give it one:

```
bash .githooks/install.sh
cp <main-checkout>/.githooks/denylist.local .githooks/denylist.local
```

This is working as designed, not a bug. `CONTRIBUTING.md` says the same thing
to strangers.

## 4. File ownership is assigned before the work starts, and it is explicit

Slices overlap at the shell. `src/app/page.tsx` and `src/components/Shell.tsx`
are where three unrelated slices all want to mount something, so exactly one
agent owns them per round and the others add at most a nav entry. An agent that
needs more than its assignment says so in its report instead of taking it.

The corollary: **build to a stated interface, not to a file that does not exist
yet.** When the browser pane and the shared pane grid were built in the same
round, the pane component shipped with a self-contained props interface on a
standalone route, and wiring it into the grid was a small follow-up. Neither
agent blocked on the other, and neither guessed.

## 5. Commit incrementally, from the first file that typechecks

A long agent run dies for reasons that have nothing to do with the work: a
transient API 500 mid-response ended two of the three agents in the first round
here, both of them partway through writing a file. Uncommitted work in a
worktree survives that, but only because the worktree happened to persist, and
resuming an agent that has committed nothing means re-establishing where it was.

So the branch gets created and pushed as soon as anything typechecks, however
incomplete, and then again at every coherent step: sidecar, then lib, then
routes, then component, then docs. Batching the commits to the end turns a
five-minute interruption into a lost run.

## The one conflict that is not a text conflict: `MIGRATIONS`

`MIGRATIONS` in `src/lib/migrate.ts` is an ordered array and **the index IS the
version**. Two parallel branches each correctly append their migration, and both
land at index 1. Git may merge that cleanly, and the result is still wrong,
because whichever merges second silently becomes a different version than the one
its branch was written and tested against.

It happened in round one: slice 2 appended a `settings` table at index 1 and
slice 13 appended a `browser_tokens` table at index 1, in separate worktrees, each
following the rule.

**Resolution, and it only works before release.** With no installs in the wild,
merge order decides the index and the second one is simply renumbered. Nothing
breaks because no database has applied either string yet. Do it at the merge, in
one place, deliberately, and never by having each agent guess an index.

**Renumbering DOES break a database that already applied the old order, and that
was observed here rather than reasoned about.** At the slice-11 merge, a local dev
database had applied `terminal_grants` as index 1 and sat at `user_version` 2. With
the array renumbered, the runner tried index 2 and 3 and died with
`SqliteError: table terminal_grants already exists`, surfacing as a 500 on the
route that opens a shell. The fix for a dev database is to delete it. There is no
fix for someone else's, which is the whole reason the rule below exists.

**After v1.0.0 this becomes a real hazard**, because renumbering an applied
migration makes an installed database silently disagree with the code, which is
the exact failure `CLAUDE.md` forbids. From then on, parallel slices that need
schema either take an assigned index up front, or one of them lands first and the
other rebases onto it.

## Resolving a CSS conflict by CONCATENATION can eat a brace, silently

The worst merge damage of the v1 round was not a migration index. Two slices had
both appended to `globals.css`, the conflict was resolved by taking both sides and
concatenating them, and the concatenation dropped ONE closing brace on `.doc hr`.

Nothing errored. **CSS nesting is real**, so the browser parsed the following
~3,000 lines as nested inside that rule, computed selectors like `.doc hr .wishes`,
and matched nothing. A third of the stylesheet was dead through four subsequent
merges. The visible symptom was a list rendering with default bullets on the first
screen a stranger reads.

**No gate could catch it and that is the lesson**: `tsc` does not read CSS, the
unit tests did not read CSS, `next build` compiled it happily because it IS valid
CSS just nested somewhere useless, and `check-paths` looks for absolute paths.

Two rules follow. **Never resolve a CSS conflict by concatenating hunks without
re-checking brace balance** (`python3 -c "s=open('src/app/globals.css').read();
print(s.count('{')-s.count('}'))"` is the whole check). And `test/css-balance.test.mjs`
now runs it for you on every stylesheet under `src/`, naming the unclosed selector
and its line, because a count alone does not tell you where to look.

## A build warning seen only in a worktree is suspect

Agent worktrees here live under `.claude/worktrees/`, which is INSIDE the project
being built. That makes Turbopack's file tracing walk up into the enclosing
project and report `Encountered unexpected file in NFT list`, naming the
worktree's own `next.config.ts`. It looks exactly like a real tracing bug
introduced by whatever slice you happen to be building.

It cost a round: slice 2 recorded it as an open defect, and a first comparison
against `main` seemed to confirm the slice had introduced it. That comparison was
wrong, because the branch was built in a nested worktree and `main` was built in
the normal checkout. **Compare like with like.** The same slice-2 commit, checked
out to a worktree at a path outside the repo and built there, produces zero
warnings.

So: before recording any build warning as a defect, reproduce it from a
non-nested checkout. `git worktree add --detach <path-outside-the-repo> <ref>`
plus `npm ci` is the whole measurement, and it is cheaper than the guessing it
replaces. Recording a phantom defect in a public-bound repo is worse than not
noticing it, because the next person budgets real time against it.

## Landing the work

Branch per slice, pushed to origin. No agent merges to `main` and no agent
pushes to `main` while a round is in flight: the maintainer merges, in order,
after the round. Agents comment on their issue with what landed, the branch
name, and what is left. They do not close it.

## What an agent cannot verify

Several slices have "done means: a Chrome walk" in their acceptance notes. The
Claude-in-Chrome extension requires the owner to pick the browser, so that walk
is scheduled with a human and is never silently skipped or claimed. An agent
states precisely what it did verify instead, and the walk stays owed.
