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

**0b. Marketing shots: re-shoot against a demo profile, or blur the real ones?**
Three quad-wall captures (2026-07-29) proved the framing works and are filed in a private
repo. They cannot ship: nine redaction rows including home paths, real profile tags,
private repo and project names, and two full panes of unreleased content. The gates here
read text and cannot read a PNG, so a screenshot is the one thing that walks past every
leak check. **Recommendation: re-shoot against a seeded demo profile** (config-driven and
local, so it is cheap) and let it ride along with the Claude-in-Chrome release walk that
is already required. The alternative is blurring, and the blur lands exactly on the
content meant to prove work is happening. The five-asset set, the placement table and the
redaction map are summarised in [docs/marketing/README.md](docs/marketing/README.md); the
full mock lives with the reference frames in the private repo.

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

**3. `marked` is installed and nothing uses it yet.** It is in the slice-1
dependency list from the issue, but the first consumer is slice 7's markdown
module. It sits in a repo that preaches a lean dependency list. Keep it (one
fewer install step later) or drop it until slice 7 needs it? I kept it.

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

## Owed by a later slice, recorded so it cannot be forgotten

**The attention feed (#2) ports TVG HQ's 2026-07-29 honesty + read-in-place fixes,
not the surfaces as they were the day the port was scoped.** Upstream (the private
hub, commit `cbf76fd`) after the owner hit both in use: (1) a third `agent-notice` kind in the
needs-you model - a question row with no options and no "?" is a REPORT (night-runner
REDs), labeled "reports"/REPORT, never "asks you", and it never takes over the wall;
(2) `AttentionLink` - a non-http link on an attention item is a file path and opens
IN the hub (the show/float mechanism) instead of a browser tab; (3) the float window
renders `.md` as markdown (marked + the shared doc styles, frontmatter stripped),
which is also the first real consumer for the installed `marked` (call #3 above).
Port all three with the feed or the stranger inherits the complaint verbatim.

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
