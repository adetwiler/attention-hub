# The email digest

**The hub can email you what is waiting. It is off, and it stays off until you
set it up with your own key.**

This is the only outbound path in the product. Everything else here runs on your
machine and talks to nothing. So this page says exactly what it does, exactly
what your email provider can see, and exactly how to turn it off again.

## What it actually is

A command:

```
hub digest
```

It reads the same attention feed the hub reads, finds what is still waiting, and
sends you one email about it. **You schedule it.** The hub has no scheduler and
does not grow one for this: nothing inside the hub decides to make a network
call, which is what keeps "the hub sends nothing about you anywhere" literally
true. The reasoning is
[ADR-0008](adr/0008-email-digest-is-the-users-own-outbound-call.md).

If nothing is waiting, nothing is sent. An empty digest is a mail that teaches
you to ignore the next one.

## Turning it on

**1. Get an API key from an email provider.** Resend is the one this version
speaks. Verify a sending address with them, because their API will refuse a
`from` address they have not verified for you.

**2. Put the key in its own file**, not in your config:

```
mkdir -p ~/.attention-hub
printf '%s' 'your-key-here' > ~/.attention-hub/resend.key
chmod 600 ~/.attention-hub/resend.key
```

**3. Fill in the `email` section of `hub.config.json`:**

```jsonc
"email": {
  "enabled": true,
  "provider": "resend",
  "to": "you@example.com",
  "from": "hub@example.com",
  "apiKeyFile": "~/.attention-hub/resend.key"
}
```

**4. Check it without sending anything:**

```
hub digest --dry-run
```

That prints the addresses, the subject, the plain text and the HTML, and never
the key, which is what makes it the thing to paste into an issue if something is
wrong.

**5. Schedule it with your own scheduler.** A cron line that runs it every
weekday morning, a launchd agent, whatever you already use:

```
0 8 * * 1-5 /usr/local/bin/hub digest
```

## THERE IS NO `apiKey` SETTING, AND THERE NEVER WILL BE

`hub.config.json` is the file people paste into a bug report when something
breaks. A secret in it is a secret that eventually leaves. So the config holds a
PATH to the key and never the key, and the hub **refuses to start** if it finds
`apiKey`, `key`, `token`, `password` or `secret` in that section. The refusal
names the key it refused and tells you to use `apiKeyFile`.

## What your email provider can see

Being exact about the part a privacy claim usually skips. Your provider
receives, and retains according to whatever their policy says:

- **The full text of every open attention item**: what was asked, who filed it,
  when. This is the part that matters. An item can quote a file path, a branch, a
  project name, or the question your agent is stuck on.
- Your `to` and `from` addresses, and the subject line, which carries a count.
- The request itself, meaning your IP address and a user agent, the same as any
  web request from any browser.

The hub sends no identifier of its own, nothing about your database, nothing
about your config, and nothing about your machine. Nothing reaches the people who
wrote this hub: there is no server on our side.

**If your attention items would embarrass you in someone else's log, do not turn
this on.** That is the honest sentence about a feature that mails your work to a
third party at your request.

## Things worth knowing

- **Quiet hours do not apply.** Quiet hours are live state in the hub's database,
  and only the hub's web process may open that database. The digest runs from
  your own scheduler, so the timing is yours to choose. If you do not want mail
  overnight, do not schedule it overnight.
- **The mail is table based with inline styles**, and it looks like it is from
  2004 on purpose: mail clients strip stylesheets and several common ones lay out
  no flex and no grid. Severity is a coloured border on a row, because it renders
  everywhere and an icon does not.
- **Replies reach nobody.** Answer the items in the hub. The mail says so.
- **Only Resend is built.** It is one HTTPS request, so the digest costs no
  dependency and no mail library ships in this tree. SMTP would need one. That is
  a stated gap rather than a quiet omission, and it is a wishlist row.
- **It works with the hub closed**, like every other `hub` command.

## Turning it off

Set `"enabled": false`, or delete the `email` section, and remove the line from
your crontab. Nothing else in the product changes: with this off, the hub makes
no outbound call at all.

## Related

- [ADR-0008](adr/0008-email-digest-is-the-users-own-outbound-call.md): why this
  exists, what it amends, and the four alternatives that were rejected.
- [ADR-0002](adr/0002-hub-architecture.md), decision 2: the no-telemetry rule and
  the mechanisms behind it.
- [docs/attention-feed.md](attention-feed.md): what an attention item is, which
  is what the digest is made of.
