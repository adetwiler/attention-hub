# Marketing assets

What the hub shows a stranger, and the rules for producing it.

## The three beats (settled 2026-07-29, see ADR-0003)

Every surface tells the story in this order. Leading with the wrong beat was a
real risk: the goal is a command center people shape to their own work, and
opening with that is a platform pitch with an empty first run.

1. **One screen. Everything running, and the one thing that needs you.** The
   concrete hero. A stranger has to see value before they are asked to build
   anything. Asset A5, the full wall.
2. **Then make it yours.** Add a tab, point it at a URL or a folder, two lines
   of config and no code. This beat must stay demonstrable in whatever ships:
   the moment it describes something not built, the whole page is a promise.
3. **We may build these in. Tell us which.** A named list of what is NOT built,
   each row linking to a prefilled GitHub issue. Reactions are the vote count.
   Static links, not a live feed, because a live feed would be a second outbound
   call and the one-call privacy claim is the clearest differentiator this
   product has.

**Beat 3 is a list of real absences, never a teaser.** Today: the board,
self-build, teams, and the module system. A row leaves the list the day it
ships.

## The asset set follows the beats

| Asset | Beat | Status |
|---|---|---|
| A5 the full wall | 1 | shot |
| A1 the decision card | 1 | shot |
| A2 the live pane header | 1 | shot |
| A4 the browser quadrant | 1 | shot |
| Two config lines becoming a tab | 2 | **not shot, and beat 2 has no image without it** |
| The wishlist | 3 | not shot |

## The rule, and the failure mode on both sides of it

A shot is eligible when it contains nothing that genuinely should not be public: real
credentials, someone else's data, work under NDA. That is a short list, and a screenshot of
your own machine doing your own published work is almost never on it.

**The gates here read text and cannot read a PNG**, so an image is the one asset type that no
automated check inspects. That is a real structural fact and it means a human has to open the
image and read it.

**It also means the judgement can fail in the expensive direction.** The first pass of this
doc treated a maintainer's own name, home path, public project names and published creative
work as leaks, and declared a ready set of screenshots unshippable. Every one of those was
wrong, and the cost was real: work blocked, and the owner made to justify his own public
material twice. **Over-classifying is a failure, not a safe default.** Open the image, read
what is actually in it, and name only what would genuinely harm someone.

Where a screenshot does carry something that must not ship, replace the content and re-shoot
rather than blurring it. A blurred rectangle sits exactly where the interesting content was.

## The manifest is for repeatability, not secrecy

`screenshots.manifest.json` records presets, targets and framing so that when the UI moves,
one recipe re-cuts the whole set at identical sizes instead of somebody re-hunting the old
composition by eye. Its redaction block is a backstop for the demo-profile path, not a
prerequisite for shipping a shot.

The `marketing-screenshots` standard covers the capture loop itself (drive the running app,
frame the element, save at the preset size).

## The asset set

Five, each carrying exactly one claim. A screenshot that argues two things argues neither.

| Asset | Claim | Where it goes |
|---|---|---|
| A1 the decision card | Your agents stop and ask, and the question waits in a counted queue | README top, the launch post |
| A2 the live pane header | Every pane says what it is doing: typing, quiet, or waiting on you | README feature row, site |
| A3 the floated document | Open a file where you are, rendered, without a browser tab | README feature row, site |
| A4 the browser quadrant | One pane is a real browser, not an embed | README feature row, the post |
| A5 the full wall | One screen, everything running, and the one thing that needs you | README hero, GitHub social preview, buildwithamemory.com hub section |

A5 doubles as the GitHub social preview, which crops to 2:1. Compose so the needs-you count
survives losing the top and bottom thirds; the current framing puts it in a corner a 2:1 crop
can clip.

## Source frames

Three quad-wall captures from 2026-07-29 are the source for the set above and are cleared for
use as-is. They live with the derived crops, the placement table and the full plan in the
maintainer's private working repo, which is where the originals are backed up; the path is in
his own notes rather than here.

## Open

One item, and it is a preference rather than a risk: the source frames show four account tags,
and the maintainer's own note says hold that detail until he has used the hub longer. Tracked
in [OPEN.md](../../OPEN.md).
