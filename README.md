# Attention Hub

A free command center for AI-assisted work that runs on your own machine.

It watches the work you and your agents have in flight, and tells you when
something actually needs you. Honestly, you can do all of this from a terminal.
The hub is for the moments between sessions: an agent hits a question and you
answer it in one click, your work in one place, and the things you keep glancing
at sitting in the nav next to it, because you added them to a config file.

Free and open source, by Andrew Detwiler / [buildwithamemory.com](https://buildwithamemory.com).

> **Early.** This is not the finished product. What works: TODAY, the attention
> feed described below, the live stream, the wall, the terminal, the browser pane,
> tabs, the setup page, and the database under it all. What does not exist yet:
> the rooms behind BOARD, SESSIONS and JOBS, the module system, the hub building
> itself, more than one person, an email digest, and the update check
> described further down (the setting is there, the code that would use it is
> not). [Not built yet](#not-built-yet) lists those and how to ask for one. What
> is here is honest about what is not.

> **macOS and Linux.** Windows is not supported in this release. See
> [Platforms](#platforms) for what that means and why.

> ⚠️ **Not verified yet. Use at your own risk.** This is a first public release
> and verification is still in progress. It has been walked end to end on one
> machine and one operating system, and that is the whole of the evidence behind
> it. Nothing here has been through outside testing, a security review, or a
> second pair of hands. Treat it as something to look at and try, not as
> something to rely on for work that matters yet.
>
> It runs locally, holds your data on your own disk, and sends nothing anywhere,
> so the blast radius is your own machine. Read what it does before you point it
> at anything you care about, and keep backups of any folder you configure it to
> read.

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

## Make it yours

Add a **tab** and it is in the nav, next to the hub's own rooms. A tab is a name
plus what it points at: a web page, or a folder on this machine.

```jsonc
"tabs": [
  { "name": "YouTube", "url": "https://youtube.com" },
  { "name": "Notes",   "dir": "~/notes" }
]
```

That is the whole job. You write no code, you clone no template, and you edit
none of the hub's own files. Restart the hub and the tab is there. With no tabs
configured the nav says so, and never shows you a sample one.

A `url` tab opens a **real browser** on this machine and mirrors it into the page,
so real logins work and so do sites that refuse to be framed. It needs the
browser pane set up once. A `dir` tab lists the folder and opens what is in it
right there, markdown rendered as markdown, and it can only ever show you what
you pointed it at.

Recipes, the exact rules, and the limits: [docs/tabs.md](docs/tabs.md).

**If you would rather not edit JSON**, hand [`prompt.txt`](prompt.txt) to the AI
command-line tool you already use. It reads `hub.config.example.json`, asks you
what you want, and writes your config. It works with any tool, because what it
follows is the comments in that file rather than anything about one vendor. That
prompt is public domain (CC0), per
[ADR-0001](docs/adr/0001-mit-license-cc0-setup-prompt.md).

Tabs are the only way this version lets you add a surface. Something with **code
of its own** is a module, it is not built yet, and
[docs/tabs.md](docs/tabs.md#where-these-docs-stop-and-why) says plainly why the
answer is not "have your AI edit the source": updates here are a plain
`git pull`, so a source edit is a merge conflict waiting for you.

## Your data is yours

- **This release makes ZERO outbound calls.** Not one, and there is no
  exception. The hub sends nothing about you anywhere, and we hold none of your
  data, because there is nowhere for it to go: the database lives in a folder on
  your machine and it belongs to you. There is no server on our side, and there
  never has been.
- **Local only.** It listens on `127.0.0.1`, which means this machine and
  nothing else, until you decide otherwise. There is no login, which is safe
  exactly while that stays true, so reaching it from another device means a
  private network in front of it, never a port forward.
- **Analytics that a framework would have turned on by default are turned off**
  in the code that starts and builds the app, not just in a README sentence.
  Every path to Next.js in this repo runs through one file that sets the switch,
  and the release check refuses to pass if any command bypasses it.
- **The promise is enforced mechanically, because a promise in a README is worth
  nothing.** A pre-commit gate blocks any non-loopback address, any
  network-capable import and any shell-out to curl or wget in the shipped code,
  unless the line carries an explicit marker and a written reason. Every marked
  line in this repo today is loopback: the hub talking to its own two sidecars on
  this machine.
- **The update check is NOT BUILT YET.** The `update` setting exists and the code
  that would use it does not. When it lands, once a day it will ask GitHub
  whether a newer release exists, send no identifiers and nothing about your
  usage, and be switchable off. Being exact about the part such a promise usually
  skips: GitHub would see the request itself, meaning your IP address and a user
  agent, the same as any browser. **Until then, updating is a plain `git pull`**
  (see [Updating](#updating)).
- Feedback happens through
  [GitHub issues](https://github.com/adetwiler/attention-hub/issues). That is
  the only channel, and it is the only place anything you say reaches us. If you
  do not say it, nobody knows it: nothing here reports anything.

## Platforms

| | The hub, the feed, tabs | The browser pane | The terminal |
|---|---|---|---|
| **macOS** | works, and this is where it was built and walked | works | works |
| **Linux** | should work, **untested** | **untested**: the discovery paths were written from documented locations and never run | **untested**: the systemd unit is written and never run |
| **Windows** | **not supported in this release** | no | no: sessions are kept alive with tmux, and there is none on Windows, so a session would not survive a closed pane |

**Untested means untested**, and it is the same convention this project uses for
adapters: something built to spec that nobody has exercised says so rather than
implying it was checked. Linux should work. If it does not, that is worth an
issue and it is not you.

**Windows is not supported in this release.** Two of the modules are POSIX
shaped, and shipping a "works on Windows" claim that breaks on first use is worse
than a stated gap. The code itself avoids Windows-hostile shapes (no shell-string
spawning, no POSIX-only path assumptions, pinned line endings) so that supporting
it later is work rather than a rewrite, and `start.cmd` is in the tree, but
nothing here has been run on Windows and this release does not claim it.
[Ask for it](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20Windows&body=I%20want%20this.)
if you want it.

## Requirements

- **Node.js 22 or newer.** Not a preference: the database driver requires it,
  and below that floor it does not refuse politely, it crashes the process on
  the first request that touches the database. The hub checks your version on
  startup and refuses with an explanation rather than letting that happen. If
  you switch Node, run `npm rebuild better-sqlite3` afterwards, because the
  binary on disk was compiled against the old one.
- A C toolchain, only if npm cannot find a prebuilt binary for your machine.
  The database driver is a native module. Most people never notice.
- **tmux**, only if you switch the terminal module on.

## Quick start

```
git clone https://github.com/adetwiler/attention-hub.git
cd attention-hub
cp hub.config.example.json hub.config.json
./start.sh
```

The first run installs dependencies and builds the app once, which takes a
minute. After that it starts straight away. When it says it is ready, open the
address it prints, which is <http://127.0.0.1:2886> unless you changed the port.

**Then open SETUP in the nav.** That page is the rest of this README, in the
product: every step leads with a prompt you hand to the AI command-line tool you
already use, which does the step for you, and the manual version is underneath
it. Nothing on it is required to keep the hub running.

That is production mode, and it is the default on purpose: it is faster, it does
not sit watching your files all day, and it avoids a confusing class of
development-only failure. If you are working on the hub itself and want your
edits picked up live, run `./start.sh dev` instead.

**If it says it is ready and then nothing is listening**, that is a known
failure with a known cause, and it is the first entry in
[docs/setup-troubleshooting.md](docs/setup-troubleshooting.md). The short
version: your Node is below the floor. Do not go looking at your firewall.

### Keeping it running

`./start.sh` dies with the terminal or the login session that started it, which
is fine while you are trying it out and wrong for something you want waiting for
you. To put it under your system's own supervisor:

```
node deploy/hub/install.mjs --print    # see the unit file, change nothing
node deploy/hub/install.mjs            # install and start it
node deploy/hub/install.mjs --remove   # stop it and take it away
```

A LaunchAgent on macOS, a systemd user unit on Linux, no sudo either way. The
browser sidecar has its own, `deploy/browser/install.mjs`, and the two sit side
by side.

**Know one thing before you rely on it:** a supervisor restarts what it
supervises, so a hub that crashes on every request still reports RUNNING, with a
pid that keeps changing. Read the log, not the service state.

## Updating

```
git pull
./start.sh
```

That is the whole update path in this release. It is safe because the three
things that are yours are not in the repository: `hub.config.json`, your `data`
folder and your `user` folder are all gitignored, so a pull cannot touch your
settings, your database, or anything you built. `start.sh` notices that the
source is newer than the last build and rebuilds before serving, so a pull
followed by a start gives you the hub you just pulled.

There is no in-app updater and no update check yet. When there is, it will be
[the one described above](#your-data-is-yours), and it will still be off with one
setting.

## Configuration

Everything lives in `hub.config.json`, and every key in it carries a `$comment`
explaining what it does. Nothing is configured anywhere else: no environment
variables to hunt for, no paths baked into the code.

`hub.config.json` is deliberately not tracked by git, and neither is your `data`
folder or your `user` folder. That is what makes updating safe: `git pull` can
never touch your settings, your database, or anything you built yourself.

**Editing the config takes effect on the next restart.**

**If you would rather not edit JSON at all, the SETUP page in the hub hands you a
prompt that writes this file for you**, by interviewing you and reading the
comments in the example. The prompt is [`prompt.txt`](prompt.txt), it works with
any AI command-line tool, and it is public domain (CC0).

Five settings worth knowing about up front:

- **`bind.host`** is `127.0.0.1`, meaning this machine only. To reach the hub
  from your phone or another computer, the right answer is a private network
  (something like Tailscale) in front of it, not opening this up. The hub has no
  login, and that is only safe while it is not reachable. The setup page walks
  through it, including why `tailscale serve` is better than changing this
  setting at all.
- **`adapters`** is where you name the AI command-line tool you already use. The
  hub is not tied to any one vendor. Until you fill it in, the surfaces that
  need an agent say so instead of pretending.
- **`tabs`** is the one above: what you want in the nav. See
  [docs/tabs.md](docs/tabs.md).
- **`terminal`** is **off**, and it stays off until you read
  [docs/terminal.md](docs/terminal.md). Switched on, it gives one pane a real
  shell on this machine, in a directory you name, so a dev server or a git
  command can run from the hub and keep running when you navigate away. It is
  also the most powerful thing here: a shell can read your keys and push your
  code, which is why it needs a second process, a deliberate step to enable, and
  a network you trust. macOS and Linux, because it keeps sessions alive with
  tmux.

## Not built yet

Named, because they are missing. None of these exists today, and nothing below is
a date.

| Not built | What it would be |
|---|---|
| [The module system](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20the%20module%20system&body=I%20want%20this.) | Surfaces with code of their own, in a folder an update never touches. Tabs are the config-only version of this, and they are what ships today. |
| [The hub building itself](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20the%20hub%20building%20itself&body=I%20want%20this.) | Describing a surface you want and having your own AI tool build it into the hub, as an action you can inspect and undo. |
| [The board](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20the%20board&body=I%20want%20this.) | The room behind BOARD: work in flight as cards you move. |
| [More than one person](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20more%20than%20one%20person&body=I%20want%20this.) | The hub is single user today, and that is stated up front rather than implied away. |
| [The update check](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20the%20update%20check&body=I%20want%20this.) | The one network call described above. The setting exists; the code that would use it does not. Updating today is `git pull`. |
| [Windows](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20Windows&body=I%20want%20this.) | This release is macOS and Linux. The terminal needs a non-tmux path and browser discovery needs Windows locations. See [Platforms](#platforms). |
| [An email digest](https://github.com/adetwiler/attention-hub/issues/new?title=Wishlist%3A%20an%20email%20digest&body=I%20want%20this.) | Being emailed what is waiting while you are away from the machine. It was built and then cut from this release, because zero outbound calls is a stronger promise than one with a footnote, and nobody had asked for it yet. |

Each link opens a prefilled issue. What gets asked for gets built, and reactions
on those issues are the only vote count there is. The same list is in the hub, at
the bottom of TODAY.

## If something is wrong

**Check [docs/setup-troubleshooting.md](docs/setup-troubleshooting.md) first.**
It covers the failures that have actually happened here, including the two that
look like something else entirely: a ready line followed by nothing listening,
and a service that reports healthy while every request fails.

If it is not there:
[open an issue.](https://github.com/adetwiler/attention-hub/issues/new) Say what
you did, what happened, and what you expected. The exact words a surface put on
your screen are worth more than a description of them.

That link is in the hub too, at the bottom of the SETUP page. It is the only
feedback channel there is: nothing in this product reports anything to anyone, so
if you do not say it, nobody knows it.

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

MIT, with one exception: the setup prompt, the thing you are told to copy, is
public domain (CC0 1.0). See [LICENSE](LICENSE) for the terms and
[LICENSE-NOTES.md](LICENSE-NOTES.md) for what the exception covers and why.
