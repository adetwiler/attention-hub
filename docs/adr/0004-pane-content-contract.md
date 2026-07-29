# ADR-0004: One pane grid, N content kinds, registered exhaustively by type

- **Status:** accepted
- **Date:** 2026-07-29
- **Context:** the quad-first re-cut made the wall v1's hero surface, and three separate slices render into it.

## Context

The wall is the surface v1 leads with, and three slices put different things in
its panes: this one draws a placeholder, the terminal slice draws a live pty, and
the browser slice draws a mirrored Chrome tab. Two of those were being built in
parallel worktrees at the same time as the grid itself.

That is the whole problem. If each slice brings its own layout, the hub ends up
with three focus models, three fullscreen behaviours, and three answers to "what
does a pane look like when its directory is missing". The user sees one wall, so
there has to be one wall.

The other failure mode is subtler and worse: a pane kind that config ACCEPTS but
nothing renders. The config loader validates `wall.paneKind` against a closed
list, so a typo is caught, but a kind that is spelled correctly and simply has no
renderer produces a pane-shaped hole. That reads as a broken product, and it is
the exact class of thing `BROKEN IS NOT EMPTY` exists to forbid.

## Decision

**`PaneGrid` owns the frame; a content registry owns the body.**

`PaneGrid` (`src/components/PaneGrid.tsx`) owns everything shared: the grid
shape derived from the pane count, the header and chip, the focus model (number
keys solo, `0` restores, `F` fullscreen, refusing to hide the last visible pane,
selection persisted per `focusKey`), and the pane-level problem state. It takes
`panes` plus a `children` render function and calls it for one pane at a time.
It **never** calls it for a pane carrying a `problem`, so no content component
has to handle the broken case.

A content component receives exactly two things: the `PaneSpec` (plain data that
crosses the server-to-client boundary) and a `PaneView` (`solo`, `index`,
`visible`) so it can show more when it is the only pane on screen.

**The registry is a `Record` over the `PaneKind` union**
(`src/components/paneContent.tsx`). That is the load-bearing choice. Adding a
kind is two edits: the name in `PaneKind`, and a row here. Because the type is a
`Record` over the union rather than a partial map, **a missing row is a compile
error**, so a kind can never be accepted by config and then render nothing.

A kind that is declared but not yet built maps to `NotBuiltPane`, which says so
in words and names the config key to change. A config written for a later release
therefore loads and the waiting pane identifies itself, instead of the hub
refusing the whole file or going blank.

**`src/lib/wall.ts` resolves config into panes and holds the honest-state rule in
one place**: a profile whose `configDir` is missing becomes a pane-level
`problem` that names the key to fix, and **the pane stays on the wall**. A pane
that silently vanishes teaches the user that the hub is unreliable, rather than
that their config has a typo.

## Consequences

- The terminal and browser slices write a body component and one registry row.
  They do not touch layout, focus, fullscreen, or error rendering, and they
  cannot each invent their own.
- `wall.ts` takes a config **loader** as an argument instead of importing
  `loadConfig`. This is not decoration: Node's native type stripping erases a
  type-only import but does not resolve an extensionless runtime one the way the
  bundler does, so importing the loader makes the module impossible to load
  through `test/_ts.mjs` and takes the whole suite file down with it. Passing the
  loader in keeps the unreadable-config path covered by a test rather than
  exiling it into a page component. `test/README.md` states the rule and
  `src/lib/migrate.ts` is the precedent. This one was learned the hard way: the
  suite was committed failing with `ERR_MODULE_NOT_FOUND`.
- `[]` is the canonical "all panes visible", never a fully populated list, so one
  layout has exactly one representation and adding a pane in config cannot leave
  a stored selection quietly hiding it.
- Fullscreen is feature-detected, because iOS Safari has no element fullscreen,
  and `localStorage` access is wrapped, because a browser with storage disabled
  should forget the layout rather than break the wall.

## Alternatives rejected

**A component per pane kind, each rendering its own frame.** Simplest to start
and it is how the upstream app grew. It guarantees drift: three focus models and
three different broken-pane renderings, in a product whose entire pitch is one
screen.

**A partial map with a runtime fallback.** Works, and moves the missing-renderer
failure from compile time to run time, which is the wrong direction for the one
error class most likely to reach a stranger's first install.
