# ADR-0003: A config-driven tab is v1's extension seam, not the module system

- **Status:** accepted
- **Date:** 2026-07-29
- **Supersedes:** nothing. Narrows the v1 scope decided in the quad-first re-cut.

## Context

The marketing promise settled on 2026-07-29 has three beats: a concrete hero
(one screen, everything running, and the one thing that needs you), then "make
it yours", then "we may build these in, tell us which".

Beat 2 is the problem this ADR exists to solve. The module system (slice 7) and
self-build (slice 5) are both labelled `post-v1` and blocked, which is where the
quad-first re-cut deliberately put them. Everything that would make "make it
yours" demonstrable therefore lives in the half that does not ship. **You cannot
lead marketing with an extension story while the extension seam does not
exist.** The options were to pull slice 7 forward, to demote beat 2 to a
roadmap line, or to find the smallest seam that makes the claim true.

Two facts made the third option cheap, and both were already in the tree rather
than being new work:

- The browser pane's `profiles[]` is data. Its own config comment says adding
  another one "is a row here, not code."
- The shell already reads a deployment default out of config (`ui`), with the
  template and a real install shipping different values.

So the machinery for "a surface described by config" is proven in this codebase.
It had simply never been offered to the user as a thing they add.

## Decision

**v1 ships one extension seam: a tab, declared in `hub.config.json`, carrying a
name and what it points at (a URL or a directory).** It appears in the nav. The
user writes no code and clones no template.

Everything richer than that stays post-v1 and is named as not built.

### What a Tab is, and is not

A **tab** is the v1 unit of "make it yours": config only, no code, no lifecycle,
no data of its own. It is deliberately weaker than a **module**, which owns a
surface, its data and whatever it needs to run, and which lives in `user/`.

The distinction matters because "widget", "module", "tab" and "pane" were being
used interchangeably in conversation, and they are four different commitments.
`CONTEXT.md` now defines Tab so that the weakest one has a name.

### The setup wizard is a prompt, not a program

The user's own AI reads `hub.config.example.json`, interviews them, and writes
their `hub.config.json`. No wizard screen is built.

This follows from the seam being config: every key already carries a `$comment`
that IS the specification, so the prompt cannot drift from the product the way
a hand-built form would. It is also vendor neutral, which a form is not: it
works with whatever AI tool the user already pays for, per the adapter stance in
ADR-0002.

### Documentation stops at the config seam, and says why

The docs show tabs with real examples and then state plainly that custom
surfaces with their own code wait for the module system, **because updates in
v1 are `git pull` and `user/` does not ship yet, so source edits would collide
with the user's own update path.**

Documenting "have your AI edit the source" would be teaching strangers to
create merge conflicts, and the first support issues this project ever received
would be self-inflicted.

## Alternatives rejected

**Pull slice 7 into v1.** Honest, and the most complete version of the promise.
Rejected because it undoes the re-cut that made v1 shippable, and because the
tab seam captures most of the demonstrable value for a fraction of the work. The
module system remains the top wishlist row, so demand for it becomes evidence
rather than an assumption.

**Demote beat 2 to a roadmap line.** Cheapest. Rejected because the marketing
would invite a stranger to make it theirs and then hand them nothing to try. A
promise with nothing behind it on day one is worse than not making it.

**A wishlist inside the app, reading GitHub for live vote counts.** Rejected on
ADR-0002: that is a second outbound call on a product whose headline is that it
makes one, and the pre-commit gate blocks any non-loopback URL under `src/` by
design. The list is static, and each row links out to a prefilled issue instead.
Reactions on those issues are the vote count, at zero cost to the privacy claim.

## Consequences

- **v1 grows by one piece of work**, the first addition since the quad-first cut
  reduced it to five items. Slice 8 (release) is blocked behind the whole set,
  so this moves the release date by whatever the seam costs.
- **A tab is a supported surface from day one**, which means its behaviour is
  now something updates must not break.
- **"Not built" becomes a named list rather than silence**: the board,
  self-build, teams and the module system each get a row and a prefilled issue.
  What gets asked for gets built, which is the same demand-signal posture
  already chosen for teams.
- **The module system, when it lands, must not orphan tabs.** A tab is the
  entry drug for a module, so the module system inherits the obligation to keep
  config-declared tabs working, or every early user's setup breaks on the update
  that was supposed to give them more.
