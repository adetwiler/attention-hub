# Open

Decisions that are not settled, and things a human should look at. Resolved rows
move out to their real home (an ADR, a topic doc, CONTEXT.md) rather than
accumulating here.

Last swept: 2026-07-29 (slice 8, the release slice).

## Needs a call from Andrew

**0-Z. SETUP READS AS A CHORE LIST, AND THAT IS THE FIRST THING A STRANGER SEES (owner,
2026-07-30).** Owner, looking at `/setup` for the first time: *"This set up looks like a holy
shit chore list. Can you please make that a lot easier?"* He is right, and it is the highest
priority item on this page, because /setup IS the onboarding for a free tool nobody has
committed to yet.

**What is wrong, concretely:** the page is long prose; it prints TWO full AI prompts inline;
it offers a hand-edit-the-JSON path as an equal option; and it mixes product philosophy
("where this is going", the multi-user roadmap) into the middle of the instructions. Nothing
on it is false. It is simply a reading assignment where a form belongs.

**The fix, and it inverts the page: DO the setup, do not explain it.**
- A real form in the hub with working defaults: hub name, data folder, port, AI tool. Save
  WRITES hub.config.json, and the hub offers the restart. No copying, no JSON, and no AI
  tool required to finish.
- One line per step, collapsed, each with a status chip (done / needed / optional). Detail
  expands only if asked for.
- The copy-a-prompt path stays as a FALLBACK link for people who prefer it, with the prompt
  body behind a disclosure rather than printed.
- The philosophy paragraphs move to the README, which is where someone deciding whether to
  trust this actually reads.
- Anything a user needs on first run (see 0-P) is pickable in that form, never a file edit.

**0-W. WINDOWS IS BACK IN v1 (owner, 2026-07-30), REVERSING 0's PLATFORM CALL.** Item 0 below
still reads "platforms are macOS + Linux, stated plainly" and is now WRONG; it stays visible
so the reversal is traceable. **Why it had to reverse:** the pilot install this release is
meant to be proven on runs on WINDOWS, so a v1 excluding Windows could never be validated
the way the rollout plan says to validate it. Both decisions sat here contradicting each
other for a day.

**What Windows costs, so the ticket is not a surprise:**
- the terminal sidecar is tmux-based, and tmux is why a closed pane does not kill a session.
  There is no tmux on Windows. The code already falls back to a plain shell when tmux is
  absent, so the decision is what to PROMISE there, not whether it runs.
- the shell is hardcoded `process.env.SHELL ?? "/bin/zsh"`. Windows wants `pwsh.exe`, which
  node-pty drives through ConPTY. PowerShell was requested by name.
- Chrome discovery is POSIX-shaped (item 0's other stated reason).
- paths: the pilot keeps everything on a second drive, organized. Every path already comes
  from hub.config.json, so this is config plus path handling, not new plumbing.

**0-P. PROJECTS AND CHECKLISTS JOIN THE FREE PRODUCT (owner, 2026-07-30).** From watching a
very organized single-account user, and free for everyone rather than a one-off branch:
- **projects as a first-class thing the USER creates**, distinct from this hub's
  function-shaped rooms. This is the new core concept and it drives the rest.
- **files under a project**, rooted wherever the user says.
- **checklists**, sitting beside attention items.
- **PowerShell** in the terminal pane (see 0-W).
- **one account, not several**: on a single-account install the account roster is ABSENT,
  not merely hidden.

**0-S. THE PILOT INSTALL IS STYLED FROM ITS SIBLING PRODUCT'S TOKENS (owner, 2026-07-30).**
So the two read as one family. That palette is dark and warm gold and this hub is already
amber on near-black, so it is a token swap rather than a redesign. Exact values live in the
owner's private notes, not in this repo.


**0-A. SLICE 8 IS BUILT ON `slice-8-release`, NOT MERGED, AND NOTHING IS
TRIGGERED.** What landed: the setup page (`/setup`), the attribution line
ADR-0001 owed, the README's platform matrix and its corrected privacy section,
the machine verification pass, and your Chrome walk as a numbered checklist
([docs/verification/2026-07-29-owner-chrome-walk-checklist.md](docs/verification/2026-07-29-owner-chrome-walk-checklist.md)).

**What is staged and waiting on YOU, deliberately untouched:** the tag (no
`v1.0.0`), the GitHub Release, making the repo public, and the
buildwithamemory.com section. The site copy that section needs is written down in
[docs/release/site-section-copy.md](docs/release/site-section-copy.md) rather than
applied anywhere, because the live site is yours and the release is deferred
behind another giveaway.

**THE EMAIL DIGEST WAS BUILT AND CUT** in the same slice, on your call: an
off-by-default bring-your-own-key module was defensible, and "zero outbound
calls, full stop" is a stronger asset than a claim with a footnote. It is on the
not-built list in the README and on TODAY, with the honest reason. The code, the
config section, the docs and the ADR are all gone; every network marker left in
the tree is loopback, and CLAUDE.md now says adding the first non-loopback one is
an owner decision and an ADR, not a commit.

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

**BUILT on branch `slice-14-tab-seam` (2026-07-29), not merged.** The `tabs` array,
the nav entries, `/tab/<slug>`, the not-built list, `prompt.txt`, and
[docs/tabs.md](docs/tabs.md). The three calls it left are 0a-ii, immediately below.

**0a-ii. THE TAB SEAM'S THREE CALLS, ANSWERED BY SLICE 8 WITH A RECOMMENDATION
EACH.** Slice 8 recommended one of each, implemented the two that are reversible,
and left them flagged here rather than deciding quietly. Overrule any of them and
each is a small change.

- **`prompt.txt` stays where it is, with that name. RECOMMENDED: keep.** Three
  reasons and none of them is inertia. The reference gate kit expects the name, so
  the day a second copy exists the gate is a port rather than a design. It sits at
  the top of the repo, which is where a stranger looks on the GitHub landing page.
  And it matches the copy-this-file convention the site already uses, so the same
  artifact reads the same way in both homes. The site's own download can still be
  called something friendlier: the mock names it `attention-hub-setup.txt`, and
  that is a different artifact (it sets the hub up from nothing; `prompt.txt`
  writes a config inside a clone). **Implemented: no change.**
- **The wishlist rows keep pointing at PREFILLED NEW ISSUES. RECOMMENDED: keep.**
  The alternative gathers reactions on one row per feature and does it by sending
  strangers into internal slice text: #3, #5 and #7 are labelled `post-v1`, they
  quote agent instructions and blocked-by chains, and they are written for you.
  Scattered votes are a tidiness problem you can fix at any time by closing
  duplicates onto a canonical row; a stranger reading "blocked by #2 #3 #4" and
  concluding the project is stalled is a first impression you cannot take back.
  The prefilled titles are fixed strings, so duplicates land under one search.
  **Implemented: no change.** If you ever want the other behaviour it is one line
  per row in `src/components/NotBuilt.tsx` and the README table.
- **`/tab` IS ABSORBED into the setup page. RECOMMENDED and DONE.** The tab seam
  is one step of setup, and two pages explaining one seam is two copies of the
  same words waiting to disagree. `/tab` now 307s to `/setup#tabs` rather than
  404ing, because it was a real address and a bookmark should land somewhere
  honest. The nav's `+ TAB` empty state points there too. `/tab/<slug>` is
  untouched. Reversible: restore the old page from `git show 20bf17c:src/app/tab/page.tsx`.

The original text of the three follows.

- **The setup prompt lives at `prompt.txt`, as ONE copy, and nothing embeds it.**
  It is the whole-config prompt (it interviews you about the hub name, dataDir,
  port, adapters, profiles, tabs and the browser pane, then writes
  `hub.config.json` and refuses to touch source), because that is what the setup
  page needs and #8 owns that page. The filename is what the reference gate kit
  expects. **The prompt-sync gate is still owed by #8** and now has a real file to
  compare the embedded copy against: port it in the SAME commit that embeds it,
  per the row further down. Nothing in the app duplicates the prompt text: the
  `/tab` page names the file instead, so there is one copy and nothing to sync
  yet.
- **The "not built" rows link to PREFILLED NEW ISSUES, not to the existing slice
  issues.** That is literally what #14 asked for, and a new issue is a stranger
  saying "I want this" in their own words. The cost: reactions scatter across
  duplicates instead of gathering on one canonical row. If you would rather each
  row pointed at its tracking issue (#3 board, #5 self-build, #7 modules) so the
  reaction count is in one place, it is a one-line change per row, in
  `src/components/NotBuilt.tsx` and the README table. Your call, and it turns on
  whether you want strangers reading internal slice text.
- **`/tab` exists as a small page of its own.** The honest empty state needed
  somewhere to go: a dim "+ TAB" in the nav with only a tooltip is a dead end on a
  touch screen. It explains the seam, lists your tabs, and points at `prompt.txt`
  and `docs/tabs.md`. **It is not the setup page**, and it does not try to be one.
  If #8's setup page absorbs it, delete it and point the nav there instead.

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

**7. Production is now the default run mode, and as of 2026-07-29 `start` also
REBUILDS when the source is newer than the build.** That second half was a
release blocker found by the first run of the integrated hub: `start` checked
only whether a build EXISTED, so with three slices merged and a 13-hour-old
build, `/wall` and `/browser` both returned 404 on a tree that had just passed
every gate. Since v1 updates are plain `git pull` and production is the default,
the shipped update path was "pull a release, restart, get the old hub". Fixed in
`scripts/serve.mjs`; a runtime `hub.config.json` change deliberately does NOT
trigger a rebuild. Record:
[docs/verification/2026-07-29-integrated-v1-smoke-and-stale-build.md](docs/verification/2026-07-29-integrated-v1-smoke-and-stale-build.md).
The original note follows.

**Production is the default run mode.** `./start.sh` builds once if
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

**13. DONE in slice 8: the setup page carries the terminal warning in its own
red-edged card**, above the terminal step, with all five bullets below in the
words they were written in, plus one more (there is no settings toggle, and there
is not going to be one). Machine-verified: items 6 to 11 and 28 to 29 of
[the machine pass](docs/verification/2026-07-29-slice-8-release-machine-pass.md).
The original brief follows, because the wording is worth keeping.

**13-orig. THE SETUP PAGE (#8) HAS TO CARRY THE TERMINAL WARNING, LOUDLY, AND HERE IS
EXACTLY WHAT IT SAYS.** The terminal module (#11) is in v1 and ships switched
off. The mechanisms are all in place (loopback bind, same-origin single-use
grant, idle timeout, a ledger row per attach, owner-only pinned in code and by
the release check), and the one door no mechanism can hold is the user's own
network. So #8 owns saying this, in its own section, not in a footnote:

- **A terminal pane is a real shell on your machine**, running as you, reached
  from a browser tab. It can read your keys and your databases and it can push
  code. That is what a shell is.
- **It is off until you turn it on**: `"terminal": { "enabled": true }` plus a
  pane of kind `terminal`, plus running the sidecar (`cd pty && npm install &&
  npm start`), plus a service file from `pty/deploy/` so it survives a reboot.
- **Never put the hub on the open internet.** The hub has no login. With this
  module on, exposing it is handing out a shell. Reach it from a phone through a
  private network, never a port forward.
- **macOS and Linux only**, because the sidecar is tmux-backed. Say it plainly;
  do not imply Windows.
- **Owner only, permanently.** When multi-person installs exist, no role but the
  owner ever gets a pty. Not a v1 limitation.

Wording that already exists and can be lifted: the `$comment` and `$security`
keys on the `terminal` section of `hub.config.example.json`, and the Security
section of [docs/terminal.md](docs/terminal.md).

**14. SETTLED, and it stays as built: `terminal.enabled` plus the sidecar, with no
UI toggle.** Two steps on the product's most powerful surface is the speed bump,
not an omission. Slice 8's setup copy now says out loud that there is no switch on
a settings screen, so nobody goes looking for one.

**15. SETTLED (owner, 2026-07-29): the wall has TWO KINDS of pane and the copy
names both.** An ACCOUNT pane is bound to a profile's config directory. A SHELL
pane is bound to a directory (`wall.panes[].cwd`) and to no account. Unifying them
into "a pane points at a place" was rejected, and the reason is the one worth
holding: unified language hides that one of the two kinds is a real shell that can
read your keys and push your code, which is exactly what item 13's warning needs a
reader to notice. Tidier prose that buries the dangerous surface is a bad trade.
Both terms are in CONTEXT.md, both are on the setup page, and the config already
documented them separately, so the copy describes reality rather than inventing a
distinction.

**18. SPLIT DNS AND SHARED DNS: I wrote what I believe you meant, and you should
check it.** The slice-8 brief listed "set up split DNS" and "set up shared DNS"
with no more detail, so the setup page describes them as Tailscale admin-console
features: split DNS as routing one domain of yours through a nameserver you
choose, so the hub answers on a name of your own rather than the tailnet name, and
shared DNS as everyone you invited resolving the same names, so the address you
tell your household is the address that works. Neither changes how the hub binds,
and the page says so. **If you meant something more specific (a particular
provider, or a name you already own), that paragraph is the place to fix it.**
Everything else in that section is verified: the Tailscale free Personal plan
covers up to 6 users and 100 devices, and signing up with a public-domain address
such as a Gmail one enrols you automatically (tailscale.com/pricing and the
pricing-v4 post, both cited on the page so nobody re-derives them).

**19. LINUX SHIPS `untested`, AND THAT IS NOW A CLAIM IN THE README.** The
platform matrix says macOS works and was walked, Linux should work and has never
been run by this project, and Windows is not supported in this release. That is
item 11's third bullet answered in the direction of honesty. The moment you (or
anyone) runs it on a Linux box, that table is the thing to update, and it is the
only place the claim lives.

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

**DONE in slice 8: the attribution footer.** `src/components/Shell.tsx` renders
"free and open source, by Andrew Detwiler / buildwithamemory.com" with the link,
per ADR-0001. The BRAND stays the user's own hub name, because a footer arguing
with the topbar is not a credit, and the credit is the "by" clause the ADR
actually specifies, so a default install reads exactly as written there.

**RESOLVED in slice 8, and there is no gate, because there is nothing to sync.**
The setup page needed the prompt, and rather than embedding a second copy it
**READS `prompt.txt` at request time** (`readSetupPrompt` in `src/lib/setup.ts`).
One copy on disk cannot drift from itself, which is a stronger answer than a gate
that catches drift after someone writes it. What replaces the gate is an assertion
in `test/setup.test.mjs`: a distinctive line of the prompt must appear in exactly
ONE tracked file. **If a second copy ever lands (a component, a doc, the site
mock), that test fails and names the file**, and that is the moment to either read
the file instead or port the real gate. The test caught itself on its first run,
which is a reasonable sign it works.

**The module system (#7) MUST NOT ORPHAN TABS.** Recorded in four places on
purpose, because it is an obligation and not an intention: the `HubTab` type in
`src/lib/config.ts`, the head of `src/lib/tabs.ts`, the slice-7 row in
[docs/claude/architecture.md](docs/claude/architecture.md), and the closing
section of [docs/tabs.md](docs/tabs.md). A tab is a supported surface from day
one, so a release that hands someone modules and quietly stops reading their
`tabs` breaks the config they wrote on their first day, on the update that was
meant to give them more. Grow the shape, never replace it.

**The tab seam's Chrome walk is OWED, and it needs you (slice 14).** Everything a
folder tab does is covered by `test/tabs.test.mjs` and was exercised by hand, but a
`url` tab renders through the browser pane, and the pane's connect step is
deliberately human (see item 11). The walk to do, once a profile is seeded: add
`{ "name": "YouTube", "url": "https://youtube.com" }` to `tabs`, restart, click
YOUTUBE in the nav, and confirm the pane opens on that address rather than on the
configured home page.

**The Chrome walk for the terminal pane (#11) is owed to a human.** Everything
below the browser was driven and measured for real
([docs/verification/2026-07-29-slice-11-terminal.md](docs/verification/2026-07-29-slice-11-terminal.md)):
26 checks including the loopback bind, the same-origin refusal, single-use
grants, ledger rows, session survival across a detach and across killing the
sidecar, the idle drop, and the size trap measured both ways. What no agent can
do is connect the Chrome extension, so these are unseen: xterm rendering in a
pane, the wall's number keys not stealing a keystroke from the shell, fullscreen
and solo re-fitting the terminal, and a real phone attaching to a desk session.

**Three branches appended `MIGRATIONS[1]` (#2 settings, #13 browser_tokens, #11
terminal_grants).** Expected, and the resolution is in
[docs/claude/parallel-agent-builds.md](docs/claude/parallel-agent-builds.md):
merge order decides the index, the later ones get renumbered at the merge, and
nothing breaks because no installed database has applied any of the three yet.
Do it deliberately in one place, at the merge, not by having each branch guess.

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

**16. THE TWO SIDECARS BOTH WANTED PORT 2887, and the terminal moved to 2888 at
the merge.** Slice 13's browser sidecar and slice 11's terminal sidecar were
authored in parallel worktrees and both picked the port after the hub's own. Two
processes cannot hold one port: whichever started second would have died with
`EADDRINUSE`, which now says so in plain words instead of printing a stack trace.
So `terminal.port` is `2888`, asserted against `src/lib/config.ts` and
`pty/server.mjs` by the release check, and the config comment says the two must
differ. This is the same class of collision as the `MIGRATIONS` index below, and
worth remembering when a third sidecar appears: **a port is an identity, so assign
it at dispatch rather than letting each slice guess.**

**17. FIVE `hub-allow-network` MARKERS IN `chrome/server.mjs` WERE ONE LINE TOO
HIGH, and this merge moved them.** The gate reads one line at a time (its own
header says so), so a marker on the comment line ABOVE a `fetch(` protects
nothing: it looks armed and is not. Those five lines passed their original commit
only because `chrome/` was added to the gate's roots AFTER they were written, and
gates scan staged additions, so nothing rescans an existing file. They would have
blocked the next commit that touched them, with a confusing message, and the merge
that widened the roots again is what surfaced it. Moved onto the code lines,
reasons unchanged, nothing about the browser sidecar's behaviour touched. Worth
knowing generally: **widening a gate's scope does not audit what is already in
the tree**, and `bash .githooks/release-check.sh` does not catch this class either,
because the whole-tree scan is content, not reach. A one-off `git grep` for
markers on their own line is the only sweep that finds it.
