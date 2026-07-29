# Attention Hub

A free command center for AI-assisted work that runs on your own machine.

It watches the work you and your agents have in flight, and tells you when
something actually needs you. Honestly, you can do all of this from a terminal.
The hub is for the moments between sessions: an agent hits a question and you
answer it in one click, your work in one place, and when you want the hub itself
to do something new, your own AI builds it.

Free and open source, by Andrew Detwiler / [buildwithamemory.com](https://buildwithamemory.com).

> **Early.** This is not the finished product. What works: TODAY, the attention
> feed described below, the live stream, and the database under it. What does not
> exist yet: the rooms behind BOARD, SESSIONS and JOBS, and the update check
> described further down (the setting is there, the code that would use it is
> not). What is here is honest about what is not.

## When something needs you

Anything on your machine can put something in front of you and read your answer
back. There is nothing to install for it and no port to reach: it appends a line
to a file, and the hub notices within a second and a half.

```
hub ask "Two rows collide on the same key. Keep the newer one?" --option "keep newer" --option "stop"
hub review "The migration touches a shipped table" --link notes/migration.md
```

(`npm link` once in the hub directory puts `hub` on your PATH. Or run
`node scripts/hub.mjs` and skip that step.)

It shows up at the top of TODAY and pops up wherever you are in the hub. You
answer it there, in one click, and the session that asked reads the answer back:

```
answer=$(hub ask "Which one?" --option a --option b --wait)
```

The hub does not have to be running when something files a question. One filed at
3am is waiting when you open it, which is the case that matters.

**Anything can write to it.** The file format is documented in
[docs/attention-feed.md](docs/attention-feed.md), and a shell one-liner or six
lines of Python is a perfectly good client. The `hub` command is a convenience
over the same file, not a privileged one. There is an
[AI-session skill](.claude/skills/README.md) that ships with the hub too.

**Quiet hours** suppress the pop-ups and nothing else. The list is never filtered,
nothing is delayed, and when quiet lifts nothing arrives in a pile: whatever came
in is simply on the list, oldest first. Default 22:00 to 06:00, and there is a
switch on the card.

## Your data is yours

- **No telemetry. Ever.** The hub sends nothing about you anywhere. We hold none
  of your data, because there is nowhere for it to go: the database lives in a
  folder on your machine and it belongs to you.
- **One network call in the whole product, and it is not built yet.** When it
  lands, once a day it will ask GitHub whether a newer release exists. It will
  send no identifiers and nothing about your usage. Being exact about the part a
  promise like that usually skips: GitHub will see the request itself, which
  means your IP address and a user agent, the same as any web request from any
  browser. Nothing about you, your work, or your hub rides along with it. Set
  `update.enabled` to `false` and even that never happens.
- **Local only.** It listens on `127.0.0.1`, which means this machine and
  nothing else, until you decide otherwise.
- **Analytics that a framework would have turned on by default are turned off**
  in the code that starts and builds the app, not just in a README sentence.
  Every path to Next.js in this repo runs through one file that sets the switch,
  and the release check refuses to pass if any command bypasses it.
- Feedback happens through
  [GitHub issues](https://github.com/adetwiler/attention-hub/issues). That is
  the only channel, and it is the only place anything you say reaches us.

## Requirements

- **Node.js 20 or newer.**
- A C toolchain, only if npm cannot find a prebuilt binary for your machine.
  The database driver is a native module. Most people never notice. On Windows,
  if `npm install` fails while building it, install the "Desktop development
  with C++" workload from the Visual Studio Build Tools and try again.

## Quick start

```
git clone https://github.com/adetwiler/attention-hub.git
cd attention-hub
cp hub.config.example.json hub.config.json
```

Then, on macOS or Linux:

```
./start.sh
```

On Windows:

```
start.cmd
```

The first run installs dependencies and builds the app once, which takes a
minute. After that it starts straight away. When it says it is ready, open
<http://127.0.0.1:2886>.

That is production mode, and it is the default on purpose: it is faster, it does
not sit watching your files all day, and it avoids a confusing class of
development-only failure. If you are working on the hub itself and want your
edits picked up live, run `./start.sh dev` (or `start.cmd dev`) instead.

## Configuration

Everything lives in `hub.config.json`, and every key in it carries a `$comment`
explaining what it does. Nothing is configured anywhere else: no environment
variables to hunt for, no paths baked into the code.

`hub.config.json` is deliberately not tracked by git, and neither is your `data`
folder or your `user` folder. That is what makes updating safe: `git pull` can
never touch your settings, your database, or anything you built yourself.

**Editing the config takes effect on the next restart.**

Two settings worth knowing about up front:

- **`bind.host`** is `127.0.0.1`, meaning this machine only. To reach the hub
  from your phone or another computer, the right answer is a private network
  (something like Tailscale) in front of it, not opening this up. The hub has no
  login, and that is only safe while it is not reachable.
- **`adapters`** is where you name the AI command-line tool you already use. The
  hub is not tied to any one vendor. Until you fill it in, the surfaces that
  need an agent say so instead of pretending.

## Teams

Not yet. The hub is single user today, and that is stated up front rather than
implied away. Multi-user is being built and it is on the public roadmap. If you
want it, say so in an issue: that is how it gets prioritised.

## For contributors

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: run
`bash .githooks/install.sh` once, which arms the content gates.

Working on the hub itself:

```
npm run typecheck   # types
npm run check       # no absolute paths, no hardcoded ports
npm test            # node:test, no dependencies
npm run build       # production build
npm run build:check # the same build, into a scratch folder, so it does not
                    # take down a hub you have running
```

Start at [CLAUDE.md](CLAUDE.md), then
[docs/context-map.md](docs/context-map.md).

## Licence

MIT. See [LICENSE](LICENSE).
