# 2026-07-29: the Chrome walk, driven by an agent as far as it goes

**This is NOT the owner's walk and does not replace it.** The owner connected a
Chrome to the extension and asked for the walk to be run, so everything a browser
can be driven through was driven. What is still owed is written at the bottom, and
it is the half that needs human hands rather than human eyes.

Walked against `main`, production build, `127.0.0.1:2886`.

## THE FINDING THAT JUSTIFIED THE WHOLE WALK

**One dropped closing brace had disabled about a third of the stylesheet, and five
green gates could not see it.**

`.doc hr {` at `globals.css:1022` was never closed. Because CSS nesting is real,
the browser did not error: it parsed the remaining ~3,000 lines as nested inside
that rule and computed selectors like `.doc hr .wishes`, which match nothing.
Everything from the browser pane block onward was dead, which is the wall, the
browser pane, the terminal, the tab seam and the setup page.

**It was mine.** Introduced at `4ac6263`, the slice-13 merge, where the
`globals.css` conflict was resolved by concatenating both sides of the merge and
the concatenation ate the brace. It survived four subsequent merges.

**Why no gate caught it, which is the part worth keeping:** `tsc` does not read
CSS, the unit tests did not read CSS, `next build` compiled it happily because it
IS valid CSS just nested somewhere useless, and `check-paths` looks for absolute
paths. The visible symptom was the wishlist rendering with default bullets and
each link running straight into its description. On the first screen a stranger
reads.

Fixed, and gated: `test/css-balance.test.mjs` walks every stylesheet under `src/`,
skips comments and strings, and fails naming the unclosed SELECTOR and its line,
because "depth 1 at EOF" does not tell you where to look. Verified both ways,
green on the fixed file and reporting `line 1022: .doc hr {` on a re-broken copy.

## The second finding, small and real

The setup page shipped **`address.It proxies`**: a missing space between a bold
lead and the sentence after it. The JSX source contained a plain space and it did
not survive to the rendered HTML. Confirmed at the HTML level rather than by
eye, then swept: a scan of `/`, `/setup`, `/wall` and `/tab` for `</b>`, `</code>`,
`</strong>` or `</a>` immediately followed by a letter found **exactly one**
occurrence in the whole product. Fixed with an explicit `{" "}` and re-scanned to
zero. Every other bold lead on that page happens to be followed by a comma, which
is why only this sentence exposed it.

## What was checked and is right

- **The shell.** Topbar, nav, unbuilt rooms dim, SETUP at the far right.
- **The footer**, on every page: the hub name, then "free and open source, by
  Andrew Detwiler / buildwithamemory.com", then the version. ADR-0001's owed item,
  present. Version reads `v0.1.0`, correct, because nothing is tagged.
- **TODAY's honest empty states.** "Nothing needs you right now", no sample data,
  and JOBS and the adapter card each say what is absent and what to do about it.
- **The not-built list** names five real absences, each a prefilled issue link,
  and the email digest row is the best copy on the page: it says the feature was
  built and then cut before release, and that the promise is worth more without a
  footnote than the feature was worth with one.
- **The setup page** detects the platform in its subtitle, leads every step with a
  one-paste prompt and a manual fallback, and states plainly that nothing below
  the first card is required.
- **The terminal warning** is a red-headed card of its own, above the terminal
  step, carrying all five points OPEN 13 specified: a real shell running as you,
  off until four deliberate steps turn it on, no switch on a settings screen and
  none coming, never put the hub on the open internet because it has no login, and
  macOS and Linux only with no Windows version faked.
- **The terminal's copy-paste prompt tells the AI to read the warning back in the
  user's own words and WAIT for a yes** before changing anything. That is the
  right shape for the most dangerous surface in the product.
- **Two kinds of pane**, named separately, per the grill decision.
- **Tailscale numbers are cited AND dated**: 6 users, 100 devices, "the published
  numbers as of July 2026", with both source URLs.
- **The wall's honest empty state**: "not configured", "NO PANES CONFIGURED", and
  the exact config key to add. No sample panes, ever.
- **The staleness fix proved itself mid-walk.** Editing CSS and restarting printed
  "The code is newer than the last build, so this one is stale" and rebuilt,
  instead of serving the old app.

## Minor, not fixed, noted

The setup page's prompt blocks scroll internally, so a wheel scroll with the
cursor over one moves the block rather than the page. Standard behaviour for a
scrollable region and arguably correct, but on a long page with several of them it
can read as the page being stuck.

## STILL OWED, and it needs the owner's hands

Everything requiring a credential, a real profile, or a second device:

1. Seeding a real browser profile (the script refuses while your browser is open,
   by design, so it has still only run against an empty scratch directory).
2. The extension Connect handshake inside a seeded profile.
3. The `url` tab's last hop to a live page.
4. xterm rendering, and whether the wall's number keys steal keystrokes from a
   live shell. Reasoned safe, because `PaneGrid` skips contentEditable and form
   fields, but never observed with a real shell attached.
5. Focus and fullscreen re-fitting with real panes.
6. A phone attaching without collapsing the desk layout.

The full 82-step list remains at
[2026-07-29-owner-chrome-walk-checklist.md](2026-07-29-owner-chrome-walk-checklist.md).
Items 1 to 24 of it are now covered by this pass.
