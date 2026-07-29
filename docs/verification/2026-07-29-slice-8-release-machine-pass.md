# Verification walk: slice 8, the deepest pass a machine can make over v1

- **Date:** 2026-07-29
- **Machine:** macOS (darwin), Node 24.16.0
- **Branch:** `slice-8-release`
- **How:** the real hub, built and served with `node scripts/serve.mjs start` on
  port 2996 (a spare port, so anything already running on 2886 was untouched),
  against hand-written `hub.config.json` files. **Every assertion below was read
  out of the served HTTP response or out of a real process**, never out of a unit
  test. The suite is a separate thing and it is green (205 tests).
- **What this walk deliberately is NOT:** the Chrome walk. The extension needs a
  human to pick the browser, so everything that only exists once a browser is
  driving the page is in the companion checklist,
  [2026-07-29-owner-chrome-walk-checklist.md](2026-07-29-owner-chrome-walk-checklist.md),
  written as numbered steps so that walk is cheap.

## Every route, requested

| Status | Path | Note |
|---|---|---|
| 200 | `/` | TODAY |
| 200 | `/wall` | |
| 200 | `/browser` | |
| 200 | `/setup` | new in this slice |
| 307 | `/tab` | to `/setup#tabs`, which is the absorbed page's forwarding address |
| 200 | `/tab/verify-notes` | a folder tab |
| 200 | `/tab/docs` | a url tab |
| 200 | `/tab/nope` | an address that is not one of your tabs, and SAYS so rather than 404ing blankly |
| 200 | `/api/ledger/stream?once=1` | the snapshot both branches share |
| 404 | `/nope-not-a-page` | |

## The shell, on every page

| # | Assertion | Result |
|---|---|---|
| 1 | The attribution line names the author (ADR-0001's owed item) | PASS |
| 2 | ...and links buildwithamemory.com | PASS |
| 3 | The footer is on the setup page too, not just TODAY | PASS |
| 4 | SETUP is in the nav, after your own tabs | PASS |
| 5 | Built rooms are links, not-built rooms are labels with a reason | PASS |

## The setup page, against the four things it owes a reader

| # | Assertion | Result |
|---|---|---|
| 6 | The terminal warning has its OWN heading, not a footnote | PASS |
| 7 | It says a terminal pane is a real shell on this machine | PASS |
| 8 | It says never put the hub on the open internet | PASS |
| 9 | It says macOS and Linux only | PASS |
| 10 | It says owner only, permanently | PASS |
| 11 | It says there is no settings toggle and is not going to be one (OPEN 14) | PASS |
| 12 | The wall's TWO kinds of pane are named separately (OPEN 15) | PASS |
| 13 | ...an account pane, bound to a profile | PASS |
| 14 | ...and a shell in a folder, bound to a `cwd` | PASS |
| 15 | The roadmap is near the top, not buried | PASS |
| 16 | It says local only and single user today | PASS |
| 17 | It says more than one person is being built, with no date | PASS |
| 18 | Tailscale's verified free numbers appear (6 users, 100 devices) | PASS |
| 19 | ...with the source cited so nobody re-derives it | PASS |
| 20 | It prefers `tailscale serve` to changing the bind address | PASS |
| 21 | It bans `tailscale funnel` in as many words | PASS |
| 22 | Split DNS and shared DNS are both explained | PASS |
| 23 | A new-issue link is in the app, not only in the README | PASS |

## The setup page's prompts

| # | Assertion | Result |
|---|---|---|
| 24 | The config step renders the TEXT OF `prompt.txt`, read at request time | PASS |
| 25 | Every other step carries its own one-paste prompt | PASS |
| 26 | The terminal prompt makes the agent read the warning and wait for a yes | PASS |
| 27 | Copy buttons are present | PASS |
| 28 | A manual fallback is present under every prompt | PASS |
| 29 | No cut feature is mentioned anywhere on the page | PASS |

## The badges tell the truth about YOUR config

| # | Assertion | Result |
|---|---|---|
| 30 | Config step reads `adapters.default`: "no AI tool named yet" | PASS |
| 31 | Tabs step counts the real tabs: "2 tabs in your nav" | PASS |
| 32 | Browser step reads `browser.profiles`: "no browser profile seeded" | PASS |
| 33 | Terminal step: "off, which is the default" | PASS |

## The attention feed, end to end, through the CLI and the running hub

| # | Assertion | Result |
|---|---|---|
| 34 | `hub ask` from a terminal, with the hub running, files an item | PASS |
| 35 | It is in `snapshot.attention` on the next request (the file is read per request) | PASS |
| 36 | It is carried as `agent-question`, with its one-tap options | PASS |
| 37 | TODAY renders it server side, options and all | PASS |
| 38 | Answering through the hub's own route, same origin, succeeds | PASS |
| 39 | `hub get <id>` prints the answer and exits 0 | PASS |
| 40 | The answer is an APPEND: the ask row is byte-identical afterwards | PASS |
| 41 | A REVIEW ask closes with `{ handled: true }` | PASS |
| 42 | ...and an empty `answer` is refused, with the reason | PASS |
| 43 | A statement with no options and no question mark is filed as a NOTICE | PASS |
| 44 | Every close is a ledger row (`answer`, `mark-handled`), which is the one history | PASS |
| 45 | With everything answered, the queue is honestly empty and TODAY says so | PASS |
| 46 | A cross-origin answer is refused (409) | PASS |
| 47 | Answering an id that does not exist is refused (409) | PASS |

**Two assertions in the first run of this walk were wrong, and the product was
right both times.** Worth recording, because both are easy to get wrong again:

- `counts.needsAnswer` counts LEDGER ROWS in the `needs-answer` state, not open
  feed items. Open items live in `snapshot.attention`. A walk that asserts
  `needsAnswer` goes up when you file a question is asserting the wrong thing.
- A review ask is closed with `{ id, handled: true }`. `{ id, answer: "" }` is
  refused on purpose, and the refusal says "an empty answer is not an answer".

## Honest degradation, with every dependency absent

| # | Assertion | Result |
|---|---|---|
| 48 | No AI tool configured: TODAY carries the "Not set up yet" card | PASS |
| 49 | Nothing waiting: "Nothing needs you right now", and no sample row anywhere | PASS |
| 50 | No browser profile seeded: the pane says "(none configured)" and offers OPEN, not a blank rectangle | PASS |
| 51 | The browser room says in plain words that it is not a frame | PASS |
| 52 | Terminal module off, readiness route: names the key AND `docs/terminal.md` | PASS |
| 53 | Terminal mint route with the module off: refused with the same sentence | PASS |
| 54 | Terminal mint from another origin: 403 | PASS |
| 55 | A wall carrying a terminal pane with the module off still renders, keeps the label, and says it is checking rather than showing a dead button | PASS |
| 56 | An account pane and a shell pane render on the same wall (the two kinds) | PASS |

### BROKEN IS NOT EMPTY, at the config level

A config that parses but is wrong (a tab with both a `url` and a `dir`), served
on port 2997:

| # | Assertion | Result |
|---|---|---|
| 57 | `/setup` still returns 200. The page that explains your mistake cannot be the page your mistake takes down | PASS |
| 58 | It says the config could not be read | PASS |
| 59 | ...and names the exact key: `tabs[0]` | PASS |
| 60 | Every badge says "config problem", never a tidy "off" | PASS |
| 61 | The nav shows `TABS?` rather than an empty tab list that looks settled | PASS |

## ZERO OUTBOUND CALLS, observed rather than claimed

The email digest was built in this slice and cut before release (owner,
2026-07-29), which makes the claim flat: this hub makes no outbound calls.

| # | Check | Result |
|---|---|---|
| 62 | `lsof` against the running hub's processes: established non-loopback connections | **0** |
| 63 | Every `hub-allow-network:` marker in `src/`, `scripts/`, `chrome/` and `pty/` is loopback or same-origin | PASS (29 markers, all loopback) |
| 64 | No `hub-allow-network` line remains under `scripts/` at all | PASS |
| 65 | `hub --help` offers nothing that sends | PASS |

## The gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run check` | clean, 64 files |
| `npm test` | 205 pass, 0 fail |
| `bash .githooks/release-check.sh` | clean |
| `node scripts/serve.mjs start` (a real production build, then served) | built and served |

## What this walk did NOT establish

- **Anything that needs a browser driving the page.** See the companion
  checklist. That includes the copy buttons on the setup page: the clipboard API
  only exists in a secure context, and while loopback is one, the failure path
  (the selected-text fallback) has never been seen by a human.
- **Linux.** Nothing in this release has been run on Linux. It ships `untested`
  and the README says so.
- **Windows.** Not supported in this release, and nothing was run there.
- **The build warnings.** `Encountered unexpected file in NFT list` and the
  multiple-lockfiles notice both appeared, and both are the known artifact of
  building inside a worktree under `.claude/` (OPEN 10). They were NOT reproduced
  from a checkout outside the repo in this run, so they are recorded as expected
  rather than as measured. Nothing in this slice touched the build config.
