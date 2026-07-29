# ADR-0008: What v1.0.0 means, when it is tagged, and why the release waits

- **Status:** accepted
- **Date:** 2026-07-29
- **Decided by:** the maintainer, in a grill after five of six v1 slices had merged.
- **Supersedes:** the rollout order in the 2026-07-27 plan (build generic, install for a specific Windows user, dogfood there, then release) and the email-module line in slice 8's scope.

## Context

Five v1 slices were merged and green, and the sixth was in flight. At that point
"what is left" stopped being a build question, because two commitments made on
different days had quietly stopped being compatible, and neither would have
surfaced by finishing the code.

**First, the dogfood step had lost its user.** The plan was to install the hub for
a specific non-technical Windows user, watch how it went, and let that de-risk the
public release. Two days later, platforms were settled as macOS and Linux, because
the terminal sidecar is tmux-backed and browser discovery is POSIX-shaped. The step
meant to de-risk the release could no longer be performed by the person it was
designed around.

**Second, the giveaway programme's one-in-flight slot was already held**, by
another project, with nothing yet released across sixteen candidates. So the hub
could not take its turn without either finishing that one or suspending the rule
the first time it was ever tested.

## Decisions

1. **The maintainer is the first install. The outside-user gate moves to v1.1.**
   He runs the hub as his daily surface for a real stretch. This is honestly
   weaker than an outside user in one specific way, and the weakness is named
   rather than glossed: he is not a stranger, so this tests the PRODUCT and not
   the SETUP FRICTION. The friction bar ("even someone who does not understand
   how to get things going should be able to") therefore remains unproven at v1
   and is the first thing v1.1 must answer, whether by Windows support or a
   documented WSL path.

2. **The other giveaway ships first; the hub takes the next slot.** Honouring the
   one-in-flight rule the first time it costs something is the only way it stays
   a rule. It also clears a four-day-stale slot before it becomes a four-week one,
   and it means the two releases do not compete for the promotion effort, which is
   the actual bottleneck.

3. **v1.0.0 is tagged when the Chrome walk passes, NOT when the repo goes
   public.** The walk is the release gate: nothing ships to a stranger on a green
   build and a passing typecheck. Once it passes, the code is v1.0.0 even though
   the repo stays private until its giveaway turn. Two things depend on this: the
   downstream vendoring work is unblocked immediately instead of waiting weeks,
   and the dogfood stretch reports against a fixed baseline rather than a moving
   target. **Dogfood findings produce v1.0.1 and up. They do not block 1.0.0.**

4. **The email digest module is CUT from v1.** It was the only piece that added a
   second outbound path. Off-by-default and bring-your-own-key made it defensible,
   and defensible was not the bar. **v1's claim is now flat: this hub makes zero
   outbound calls.** No asterisk, no exception paragraph, no "unless you turn on".
   That sentence is the product's strongest asset and an exception costs more than
   a digest is worth, especially since every strong claim with a caveat invites
   scrutiny of the others. It moves to the "not built, tell us if you want it"
   list, where a real user asking for it is the signal to build it. Nobody has.

5. **A pane is TWO things, said plainly, not one thing said tidily.** A pane
   watches an ACCOUNT (bound to a profile's config directory) or it is a SHELL IN
   A FOLDER (bound to a working directory, no profile). Unifying them into "a pane
   points at a place" reads better and was rejected, because it hides that one
   kind is a real shell that can read keys and push code. On the one page whose
   job is to stop someone exposing a root shell, prose that buries the dangerous
   surface is a bad trade.

## Consequences

- The privacy promise is one sentence and must stay one sentence. Anything that
  adds an outbound path now requires reopening this ADR, which is the point.
- v1 ships with its friction bar untested. That is a known, named gap, not an
  oversight, and it is v1.1's first job.
- The public roadmap already says local-only today with teams being built. Nothing
  here changes that, and the Windows gap should be stated in the same honest
  register rather than as a promise with a date.
- The repo stays private through tagging. A tag is not a publication.
