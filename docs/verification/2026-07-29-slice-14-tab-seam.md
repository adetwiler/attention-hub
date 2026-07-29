# Verification walk: slice 14, the tab seam

- **Date:** 2026-07-29
- **Machine:** macOS (darwin), Node 24.16.0
- **How:** the real hub, started with `node scripts/serve.mjs dev` on port 2996 (a
  spare port, so a hub already running on 2886 was untouched), against three
  hand-written `hub.config.json` files in turn. Every assertion below was read out
  of the served HTML, not out of a unit test.
- **Folder used:** a temporary notes folder outside the repo, containing a
  markdown file, a text file, a subfolder, and a **symlink pointing at
  `/etc/hosts`**, which is the containment test. Deleted afterwards, along with
  the config.

## Config A: three tabs, one of them pointing nowhere

```jsonc
"tabs": [
  { "name": "YouTube",  "url": "https://youtube.com" },
  { "name": "My Notes", "dir": "<temp>/notes" },
  { "name": "Gone",     "dir": "<temp>/nope" }
]
```

| # | Assertion | Result |
|---|---|---|
| 1 | All three appear in the nav, after the hub's own rooms, in config order | PASS |
| 2 | A two-word name becomes one address | PASS (`/tab/my-notes`) |
| 3 | The folder tab lists folders first, then files, hiding nothing | PASS (`sub/`, `escape.txt`, `note.md`, `plain.txt`) |
| 4 | A markdown file renders AS markdown, in the hub | PASS (`<h1>Hello</h1>`, `<em>markdown</em>`) |
| 5 | A `url` tab renders the browser pane, opening on the configured address | PASS (the pane is on the page and carries `https://youtube.com`) |
| 6 | BROKEN IS NOT EMPTY: the tab pointing nowhere STAYS in the nav | PASS |
| 7 | ...and its room names the exact key to fix | PASS (`Fix "tabs[2].dir" in hub.config.json, or remove that tab`) |
| 8 | An address that is not one of your tabs says so, rather than 404ing blankly | PASS (`There is no tab called "nope" in your config`) |
| 9 | `/tab` lists your tabs and says which kind each is | PASS (3 tabs, "a web page" / "a folder") |
| 10 | TODAY carries the not-built list, with prefilled issue links | PASS (4 rows, each `issues/new?title=Wishlist%3A...`) |

### Containment, against the real running app

| # | Attempt | Result |
|---|---|---|
| 11 | `?path=escape.txt`, a symlink to `/etc/hosts` | REFUSED ("outside `<temp>/notes`"), and no file content in the response |
| 12 | `?path=../../etc/hosts` | REFUSED |
| 13 | `?path=<absolute path to a file next to the folder>` | REFUSED |

## Config B: no tabs at all

| # | Assertion | Result |
|---|---|---|
| 14 | The nav says so, and it is a real link rather than a dead label | PASS (`+ TAB` linking to `/tab`) |
| 15 | No sample tab anywhere | PASS |
| 16 | `/tab` says you have none, and that nothing is broken | PASS |

## Config C: a tab with BOTH a url and a dir

| # | Assertion | Result |
|---|---|---|
| 17 | The hub still serves TODAY (the nav cannot take down the page explaining the mistake) | PASS (HTTP 200) |
| 18 | The nav flags it rather than showing an empty tab list | PASS (`TABS?` carrying the message) |
| 19 | The message names the row and the rule | PASS (`expected either a "url" or a "dir", never both (a tab points at one thing) at "tabs[0]"`) |
| 20 | The boot script starts anyway, by design | PASS (it validates only the keys it uses; the verdict lands on a hub you can reach) |

## Gates

`npm run typecheck`, `npm run check`, `npm test` (174 tests, 0 failures),
`npm run build:check`, `bash .githooks/release-check.sh`: all clean.

The build printed the two warnings a NESTED worktree always prints here (multiple
lockfiles, and `Encountered unexpected file in NFT list` naming the worktree's own
`next.config.ts`). Per [OPEN item 10](../../OPEN.md) and
[parallel-agent-builds.md](../claude/parallel-agent-builds.md) those are artifacts
of building under `.claude/worktrees/`, not defects, and they are not recorded as
findings.

## NOT verified, and why

**The `url` tab has not been walked against a real browser.** The pane is on the
page and it carries the configured address, but the browser pane's connect step is
deliberately human (the extension makes you pick the browser), and no profile has
ever been seeded on this machine. So what is proven is that a `url` tab renders the
existing pane with the right props; what is not proven is the last hop, which is
the same hop OPEN item 11 already owes. The walk is one line long and it is
recorded in OPEN.md.
