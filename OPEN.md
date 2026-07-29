# Open

Decisions that are not settled, and things a human should look at. Resolved rows
move out to their real home (an ADR, a topic doc, CONTEXT.md) rather than
accumulating here.

Last swept: 2026-07-28 (after the slice-1 review pass).

## Needs a call from Andrew

**0. v1 WAS RE-CUT QUAD-FIRST on 2026-07-29, and this doc has not caught up.** Owner
approved: v1 is now exactly FIVE items - #2 attention feed, #11 terminal room port (the
live wall), #9 re-scoped to config-driven account panes + focus, #13 the browser pane, #8
release. Everything else (#3 board, #4 bench/jobs, #5 self-build, #6 machine + the update
channel, #7 module system, #10 tmux-native control) is labelled `post-v1`. Two decisions
ride with it: **platforms are macOS + Linux, stated plainly** (the terminal sidecar is
tmux-based, Chrome discovery is POSIX-shaped), and **updates are `git pull` in v1** - #6's
Releases check is post-v1, so keep the README's honest NOT-BUILT-YET wording and add the
plain pull instruction rather than dropping the section.

Consequence worth holding: #7 being post-v1 means EPIC C (TVG HQ rebuilding on this
template with its game rooms as user modules) is a v1.1 story. A stranger's v1 is
unaffected; what waits is Andrew becoming the first template install.

Full record + the reasoning: `~/.claude/memory/project_attention_hub_giveaway.md`.

**0a-i. README DRIFT, caught by the same rule that created it (2026-07-29).** The
README's opening paragraph says *"when you want the hub itself to do something new,
your own AI builds it."* That is self-build (#5), which is `post-v1` and blocked. It
is stated in the present tense on the first screen a stranger reads, which is exactly
the failure ADR-0003 exists to prevent: never market a capability that has not
shipped. The "Early" callout below it lists what is missing but does not retract this
sentence, and a reader who hits the gap trusts the privacy claims less too.

**Fix it when the tab seam lands (#14), in the same pass**, so the opening describes
what beat 2 actually ships: adding a tab in config, no code. Self-build moves to the
"not built, tell us if you want it" list with the board, teams and the module system.

**0a. v1 GAINED A SIXTH PIECE OF WORK on 2026-07-29: the tab seam.** Grilled and
accepted as [ADR-0003](docs/adr/0003-tab-seam-over-module-system-for-v1.md). The
marketing leads with a concrete hero and makes "then make it yours" the second
beat, and that beat needs something a stranger can actually try on day one. So
v1 ships ONE extension seam: a tab declared in `hub.config.json` (a name plus a
URL or a directory), appearing in the nav, no code written by the user. The
module system (#7) and self-build (#5) stay `post-v1` and become the top rows of
a named "not built, tell us if you want it" list.

This is the first thing added back since the quad-first re-cut reduced v1 to five
items, and #8 (release) is blocked behind the whole set, so it moves the release
date by whatever the seam costs. **Filed as #14, labelled `v1`** (2026-07-29), and
the night fleet's milestone count moved 5 to 6 to match. Two things ride with it: the setup wizard is a PROMPT (the user's own AI reads
`hub.config.example.json`, interviews them, writes their config) and never a
built screen, and the docs stop at the config seam and say plainly why, since
`user/` does not ship until #7 and `git pull` updates would collide with source
edits.

**0b. Marketing shots are CLEARED, with one preference left.** Three quad-wall captures
(2026-07-29) are the source set and need no redaction: the maintainer's name and home path
are published under his own byline, the projects on screen have public pages, the creative
content visible is a recap of already-released material, and the video playing in the
browser pane is his own published devlog, which is why the shot was taken. An earlier pass
of this file called all of that a leak and blocked the set. It was wrong, and the
correction is written into [docs/marketing/README.md](docs/marketing/README.md) because
over-classifying is a failure mode worth naming, not a safe default.

**The one open item is a preference:** the frames show four account tags, and his own note
in the giveaway plan says hold that detail until he has used the hub longer. Keep it and
the set ships untouched; drop the constraint and there is nothing left to do.

**1. The default port is 2886, picked by me.** It is ATTN on a phone keypad and
it is in the IANA unassigned range. If you would rather it be something else,
now is the cheap moment: it is in `hub.config.example.json`, `src/lib/config.ts`
and `scripts/serve.mjs`. The three no longer drift silently: the release check
now parses the example and fails if either constant disagrees with it.

**2. The leak-gate stance for a stranger is "fail closed, with a helpful
message", and it got STRICTER.** A missing, empty, malformed, CRLF-mangled or
still-placeholder `.githooks/denylist.local` refuses the commit. The new part is
the placeholder refusal: `install.sh` still copies the example for you, but the
hook now detects the unedited copy and says so, because a placeholder that
passes a non-empty check while protecting nothing is worse than no gate. It
looks armed. Confirm you are happy with a stranger meeting this on their first
commit, or say the word and contributors get a marker-file exemption.

**3. RESOLVED by slice 2: `marked` now has a real consumer.** It renders a
markdown file an attention item links to, inside the hub, via
`src/lib/markdown.ts`. Keeping it was the right call.

**4. No icons, anywhere, on purpose.** The house rule is inline Lucide SVG and
never emoji. The approved mock's hub screenshot uses coloured dots and no icons,
and adding `lucide-react` would break the stated dependency philosophy of this
repo. So slice 1 ships dots, matching the mock exactly. If you want real icons
in the hub, that is a deliberate dependency decision, not something I should
have taken quietly.

**5. Three high-severity npm advisories, all transitive through Next.js**
(`postcss`, `sharp`). `npm audit fix --force` wants to install Next 9, which is
not a fix. Nothing actionable until upstream ships, so this is a "you should
know" rather than a task. Worth a re-check before the public release.

**6. Two config parsers still exist, and I did not merge them.** The review
asked for one validator with one verdict, shared between `scripts/serve.mjs`
(plain `.mjs`, which runs before any TypeScript exists) and `src/lib/config.ts`.
What I did instead: made the boot script REFUSE exactly what the loader refuses,
in the same message vocabulary, and covered the agreement with tests
(`test/serve-config.test.mjs` drives the real script as a process). The full
extraction needs either `allowJs` (which loses strict checking inside the most
safety-critical file in the repo) or a hand-written `.d.mts` (which trades one
duplication for another). The behavioural hole is closed: the boot script no
longer substitutes a default over a value you actually wrote, so it can no
longer announce and bind a port you never asked for. Say the word if you want
the full merge anyway.

**7. Production is now the default run mode.** `./start.sh` builds once if
needed and serves the built app; `./start.sh dev` is the contributor path. This
is a user-facing change from the first draft, recorded as ADR-0002 decision 8.
The consequence to know about: live pickup of a user's own modules and pages is
a dev-mode property, so slice 7 has to either make module changes work in
production or say plainly that they need a restart.

**8. The attention feed does not rotate, and slice 2 left it that way on
purpose.** One line per item plus one per answer, so it grows slowly, and
everything answered is history. The contract says so out loud
([docs/attention-feed.md](docs/attention-feed.md)) with the honest advice to move
old lines by hand. Worth revisiting only if a real install ever notices; a
rotation scheme that splits the file is a new way for an answer to go missing.

**9. The Chrome walk for slice 2 is OWED, and it needs you.** The release gate
(the plan node, 2026-07-29) is a Claude-in-Chrome end-to-end walk, and the connect
step is deliberately human: the extension needs you to pick the browser. The walk
to do: file an item from a terminal, watch it toast live, answer it, confirm
`hub get <id>` reads the answer back, then resolve a review ask and see the
closing row appended. Everything except the in-browser half is verified by the
suite and by hand (see the comment on issue #2).

**10. RESOLVED, and it was never the product: the Turbopack NFT warning is an
artifact of building inside a nested worktree.** `Encountered unexpected file in
NFT list` appeared on the slice-2 branch and not on `main`, which looked like the
slice had introduced it. It had not, and the first comparison was not apples to
apples: the branch was built inside a worktree under `.claude/worktrees/` while
`main` was built in the normal checkout.

The measurement that settled it: the SAME slice-2 commit, checked out to a
worktree at a non-nested path and built there, produces **zero** warnings. The
warning names the worktree's own `next.config.ts`, which is the tell. Building
under `.claude/` makes Turbopack's file tracing walk up into a directory that is
inside the project it is tracing, so it reports that the whole project was traced
unintentionally.

Nothing to fix in `src/`, and the removed `turbopackIgnore` markers were correctly
removed: they were never going to help. The lesson, which applies to every agent
worktree, is in
[docs/claude/parallel-agent-builds.md](docs/claude/parallel-agent-builds.md):
**a build warning seen only in a nested worktree is suspect until reproduced from
a normal checkout.** Compare like with like before recording a defect in a
public-bound repo.

**11. The browser pane needs YOU once, and it cannot be done without you (slice
13).** Three things, all human by nature:

- **Seed a real profile.** `node scripts/seed-browser-profile.mjs` reads your
  actual browser's profile folder and REFUSES while that browser is open, so it
  has never been run against real browser data here. The walk used an empty
  scratch directory. Quit Chrome, run it, and check the pane can open the copy.
- **Connect an AI browser session to it, once per profile.** The extension makes
  you click Connect in the right browser on purpose, so nothing automated can do
  it. Everything that story depends on (FOLLOW, the tab picker, parking a window
  the moment it appears) is verified; the handshake is not.
- **Decide whether Linux ships as tested or as untested.** The discovery paths and
  the systemd unit are written from documented locations, never run. The adapter
  convention in this repo is that something built to spec but never exercised is
  marked `untested` and the UI says so. Nothing marks the browser pane that way on
  Linux right now, and one honest sentence in the README would.

**12. Two decisions in slice 13 are mine, and both are cheap to change now.**

- **`browser.profiles` is a SECOND list next to the top-level `profiles`.** One is
  accounts (a label and your AI tool's config directory), the other is browser data
  directories (a port, a source folder, a seeded copy). They are separate because a
  browser brings constraints an account does not have, and CONTEXT.md now says so.
  The alternative was one list with a nested `browser` block, which reads tidier and
  couples the browser pane to the account model. Say the word and it merges.
- **The default search engine and home page are DuckDuckGo**, in config, with a
  `{}` placeholder so any engine works. There is no vendor written into the code.
  Pick a different default if you would rather.

## Owed by a later slice, recorded so it cannot be forgotten

**DONE in slice 2: the three 2026-07-29 honesty + read-in-place fixes are ported.**
(1) `agent-notice` is in the CONTRACT, not just the display layer: a row with no
options and no question mark is a REPORT, labelled REPORT, never "asks you", and a
writer can declare it explicitly. (2) A non-http `link` is a file path and opens
IN the hub. (3) The float window renders `.md` as markdown, frontmatter stripped,
which is also `marked`'s first consumer. The one upstream behaviour NOT ported is
"a notice never takes over the wall", because in this repo the toast stack is
capped at three and dismissible and there is nothing for an item to take over.

**The update check is not built (slice 6).** The config section, the README
bullet and `CONTEXT.md` all say so in as many words. When the code lands, all
three change in the SAME pass, and the transport-level clause (GitHub sees an IP
address and a user agent, and nothing else) stays.

**Attribution footer text (slice 8).** The seam is in `src/components/Shell.tsx`
and currently renders the hub name plus "free and open source". Per ADR-0001 the
released line is "Attention Hub, free and open source, by Andrew Detwiler /
buildwithamemory.com" with the link. It is deliberately not written yet because
slice 8 owns the release copy.

**The prompt-sync gate (slice 8).** The reference gate kit compares the README's
embedded prompt against `prompt.txt` on every commit that touches either. This
repo's setup prompt does not exist until slice 8, and its sync point is the
collapsed prompt card in the buildwithamemory mock. When that file lands, port
the gate in the SAME commit. Two drifting copies of the hero prompt is the most
embarrassing inaccuracy this repo could ship.

**A CI backstop (unassigned).** `--no-verify` bypasses the local hook, and the
release check is manual. A GitHub Actions job running
`bash .githooks/release-check.sh --generic-only` on push would make the generic
half non-bypassable. The `--generic-only` flag already exists for exactly this.
The denylist half CANNOT run in CI: the list is machine local by design, and
making it a repo secret is worse, because workflow code in a public repo can
read secrets.

**Board and Sessions rooms.** The nav renders them greyed with "Not built yet."
Slices 2 to 4 make them real. If a slice lands one, flip `built` in the `ROOMS`
array in `Shell.tsx`.

**Live config reload.** `loadConfig()` caches for the process lifetime, so
editing `hub.config.json` needs a restart. `resetConfigCache()` exists and is
exercised by `test/config.test.mjs`. For a giveaway aimed at non-technical
users, stat-the-file-and-invalidate is probably worth doing before release; the
setup docs say "restart" in the meantime.

## Resolved

- **Licence.** MIT repo-wide, CC0 for the setup prompt. See ADR-0001.
- **`hub.config.json` tracked or ignored?** Ignored; the example is tracked. If
  the live config were tracked, every user who edited it would conflict on
  `git pull`, which breaks the user-space promise. ADR-0002, decision 3.
- **The name.** Attention Hub. The repo exists and the mock is approved. Settled.
- **ADR numbering.** The architecture ADR is 0002, not 0001. The licence ADR
  landed first and the plan node cites it by number. The slice-1 issue text
  still says 0001; that is a spec-versus-tree difference recorded on purpose,
  not a gap to rediscover. No renumbering: it would break more references than
  it fixes.
- **No test framework?** Wrong call, reversed. `node:test` ships inside the
  Node 20 that the `engines` field already requires, so the regression net costs
  zero dependencies. `npm test`. See [test/README.md](test/README.md).
