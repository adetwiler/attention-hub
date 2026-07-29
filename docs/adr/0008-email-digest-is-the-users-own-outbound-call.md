# ADR-0008: The email digest is the user's own outbound call, and the hub still initiates nothing

- **Status:** accepted
- **Date:** 2026-07-29
- **Slice:** 8 (release)
- **Amends:** [ADR-0002](0002-hub-architecture.md) decision 2, which said the
  update check would be the single outbound call the product ever makes.

## Context

The hub is local only and it has no notifications that leave the machine. That
is the whole promise, and it has one real hole in it: **a hub that can only
reach you on the machine you walked away from cannot tell you anything while you
are out.** The feature that closes it is an email digest of what is still
waiting, and the owner asked for it in the release slice.

It collides with the strictest rule in this repo. ADR-0002 decision 2 says the
hub sends nothing about the user anywhere and that the ONE outbound call the
product will ever make is the daily GitHub Releases check. That rule is not a
sentence in a README: the pre-commit hook blocks any non-loopback URL, any
network-capable import and any curl or wget under the shipped-code roots, unless
the line carries `hub-allow-network:` and a reason.

Two facts sharpen the collision rather than softening it:

- **In v1 the update check does not exist.** Slice 6 is post-v1, so v1's honest
  claim is stronger than ADR-0002's: the hub makes ZERO outbound calls of its
  own. Adding an email module without care would take the product from "zero" to
  "one, and it is the one we told you about" in the same release that first got
  to say zero.
- **A digest is not a ping.** The update check would send nothing about the
  user. A digest sends the user's own attention items, in plain text, through a
  third party. It is a bigger disclosure than the thing the rule was written to
  forbid.

## Decision

**The email digest ships, off by default, and it is built so that the sentence
"the hub sends nothing about you anywhere" stays literally true.** Five
properties, and each one is a mechanism rather than an intention.

### 1. The hub does not send it. A command you schedule does.

The sending lives in `scripts/hub.mjs digest`, the dependency-free CLI, and
**nothing under `src/` gains a network call.** There is no timer in the web
process, no queue, no background worker. The digest happens when your own cron
or launchd runs the command, which means the hub itself still initiates nothing,
in the plainest sense of the word: with the hub closed, this feature still works,
and with the hub open and nothing scheduled, it never fires.

That also settled where the code lives. The CLI already knows where the feed is
and what counts as still waiting, and a third copy of "where is the feed" is a
wart this project has already named once.

### 2. Off, and incomplete is not on

`email.enabled` defaults to false. An enabled section missing `to`, `from` or
`apiKeyFile` refuses to send and names exactly what is missing, rather than
half-sending or quietly doing nothing.

### 3. The key is a PATH, never a value

There is no `apiKey` setting and there never will be. `hub.config.json` is the
file people paste into a bug report when something breaks, so a secret in it is
a secret that eventually leaves. **Both the loader and the CLI refuse
`apiKey`, `key`, `token`, `password` and `secret` in that section by name**, and
say to use `apiKeyFile` instead. A dry run prints everything the send would use
except the key.

This is the same reasoning that made ADR-0007 reject a long-lived terminal token
in the config, applied to the one secret this product could not avoid having.

### 4. One provider, chosen for having no dependency

Resend, over one HTTPS request. The issue text said "Resend or SMTP", and SMTP
is **not** in this release: it would need a mail library inside the shipped tree,
and the send lives in the file whose header promises it is dependency free.
Saying so out loud is the honest version; a quiet omission is not. SMTP is a
wishlist row.

### 5. It is said out loud where the promise is made

The README's privacy section, the config comment, the setup page and
[docs/email-digest.md](../email-digest.md) all carry the same shape, and none of
them buries it: v1 makes zero outbound calls on its own; if YOU configure the
digest with YOUR key, the hub emails YOU through the provider you picked; that is
the only exception, and it is off until you turn it on.

## What the transport actually sees, said plainly

The provider you chose (Resend today) receives, and can retain according to
whatever their policy says:

- **The full text of every open attention item**: what was asked, who filed it,
  and when. This is the part that matters. An attention item can quote a file
  path, a branch name, a client name, or the question an agent is stuck on.
- Your `to` and `from` addresses, and the subject line, which includes a count.
- The request itself: your IP address and a user agent, as with any HTTPS
  request.

The hub sends no identifier of its own, no usage data, no telemetry, and nothing
about your database, your config or your machine. It also cannot see any of this
itself: there is no server on our side, and there never has been.

**If your attention items would embarrass you in someone else's log, do not turn
this on.** That sentence is in the docs too. It is the honest form of a feature
that mails your work to a third party at your request.

## Alternatives rejected

**Do not ship it.** The strongest position for the privacy claim, and it leaves
the product's own hole open: the hub cannot reach you when you are not at the
machine, which is exactly the moment an attention item matters most. Rejected
because the hole is real and the mitigation is a mechanism rather than a
promise.

**A scheduler inside the hub.** One line of config and a timer in the web
process, and it would be the hub deciding to make a network call. That is
precisely the thing this ADR exists to avoid saying yes to.

**A key in `hub.config.json`.** Simpler for the user by one step, and it puts a
live credential in the file most likely to be pasted into a public issue.

**SMTP as well, via a mail library.** A dependency inside the shipped tree, in
the one script whose header promises it has none, for a provider shape this
release cannot exercise. Named as not built instead.

**A webhook or a push service.** Every one of them is a server someone runs.
Email is the only notification channel where the user already has an account
with someone they chose.

## Consequences

- **ADR-0002 decision 2 now has a second clause**, and that ADR points here. The
  wording everywhere becomes "the hub initiates nothing; the one outbound path is
  a digest you configure and schedule yourself".
- **The network gate has a second marked line**, in `scripts/hub.mjs`. That is
  the marker doing its job: an exfiltration shape now has to be argued for in a
  reason string that a reviewer reads, which is what it was built for.
- **Quiet hours do not apply to the digest.** Quiet hours are live state in the
  hub's database, and only the web process may open that database (the single
  writer rule in ADR-0002 decision 4). The schedule is yours, so the timing is
  yours. Said in the docs rather than left to be discovered.
- **If a hosted or teams edition ever exists**, this ADR is the precedent to
  argue with: a user-configured, off-by-default, bring-your-own-key path is not
  the same thing as the product phoning home, and nothing here licenses the
  second.

## Related

- [ADR-0002](0002-hub-architecture.md), decision 2: no telemetry, and the four
  mechanisms behind it.
- [ADR-0007](0007-terminal-sidecar-and-its-trust-model.md): why a long-lived
  secret in the config was rejected once already.
- [docs/email-digest.md](../email-digest.md): the user-facing contract.
