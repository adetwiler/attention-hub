# ADR-0001: MIT for the repo, CC0 for the setup prompt

Date: 2026-07-27
Status: accepted (owner-grilled, grill-with-docs session)

## Context

The hub releases free as a brand-funnel giveaway (registry:
`wide_free_value_giveaways`, program posture "MIT, issues ON, as-is"). The
question grilled: should third parties be able to SELL it? Every real
open-source license permits selling; forbidding sale means source-available
(PolyForm NC / FSL / BUSL), which costs trust with exactly the developers the
funnel targets. The realistic threats considered: a hosted SaaS wrapper
(AGPL's case), a rebrand without credit, and undercutting a future paid teams
tier.

## Decision

1. **MIT for the whole repository.** Yes, they can sell it.
2. **The setup prompt is CC0** (public domain): it mirrors onto
   buildwithamemory.com as a copy-paste artifact, and that site's rule is
   "the thing you are told to copy is public domain." Same artifact, same
   license, both homes.
3. **Attribution is a product feature, not a license term:** a small footer
   line in the hub ("Attention Hub - free and open source, by Andrew
   Detwiler / buildwithamemory.com") plus the README header. Ships in the
   code so forks carry it by default; stripping it is permitted and fine.

## Why selling is not a threat (owner, 2026-07-27)

> "What they're getting from using my tool is updates and stuff like that,
> and my memory network and all this other stuff. Really that's what they
> get versus me, versus someone just using it to go sell it."

A fork sells a frozen snapshot. Users of the real thing get the living
stream: the update channel (GitHub Releases + in-hub apply), the memory
network integration, the module ecosystem, and the author. Adoption feeds
the funnel; the moat is the public lane, never the code.

The monetizable layer is already protected by structure, not license: teams
/ multi-user (phase 2) builds privately and lands only on owner say-so. As
sole copyright holder, the owner can ship a commercial or hosted teams
edition later regardless of the core's MIT license; inbound MIT
contributions remain usable in that edition without a CLA.

## Consequences

- Slice #8's license placeholder is resolved; release day ships this file
  as-is.
- No AGPL means no license friction for user-space modules (the headline
  plug-and-play feature) and nothing deterring corporate users.
- A hosted wrapper is legal. Accepted: it would prove demand, and it
  competes with the free local tool plus a phase-2 teams edition, not with
  a secret.
