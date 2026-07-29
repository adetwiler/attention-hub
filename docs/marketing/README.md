# Marketing assets

What the hub shows a stranger, and the rules for producing it.

**No raw screenshots live in this repo.** The gates here read text. They cannot read a PNG,
which makes a screenshot the one asset type that walks past every leak check you built. So
source frames stay in a private repo and only redacted, purpose-built shots land in
`shots/`.

## The rule

A shot is eligible when all three are true:

1. **Nothing personal in frame.** No home paths, no real account names, no private repo or
   project names, no client work. Same list as the CLAUDE.md public-repo rule, applied to
   pixels.
2. **It was produced from the manifest**, not cropped by hand from whatever was on screen.
   `screenshots.manifest.json` is the recipe: presets, targets, and the redaction list. A UI
   change means re-running it, not re-hunting the old framing.
3. **The redaction was asserted, not eyeballed.** Re-scan after masking and confirm zero
   pattern matches remain. A shot with one surviving match is not delivered.

## Produce them against the demo profile, not a real one

The hub is local and config-driven, so the honest way to get marketing shots is a seeded demo
config: generic profiles, believable queued items including one real question, and a project
name that belongs to nobody. That beats blurring a live wall, where the blur lands exactly on
the content that was supposed to prove work is happening.

The `marketing-screenshots` standard covers the capture loop itself (drive the running app,
frame the element, redact, assert, save at the preset size).

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

## Reference frames

Three quad-wall captures from 2026-07-29 proved the framing works and are the composition
reference for the set above. They are unredacted, so they live in a private repo along with
the full plan, the derived crops at size, the placement table and the redaction map. The
maintainer's own notes hold the path; it is deliberately not written here, for the same
reason the leak gate keeps its denylist out of the tree.

## Open

Owner call pending: re-shoot against a seeded demo profile (recommended, and it can ride along
with the Claude-in-Chrome release walk that is already required) or blur the reference frames
and ship sooner. Tracked in [OPEN.md](../../OPEN.md).
