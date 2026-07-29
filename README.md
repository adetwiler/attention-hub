# Attention Hub

A free command center for AI-assisted work that runs on your own machine.

It watches the work you and your agents have in flight, and tells you when
something actually needs you. Honestly, you can do all of this from a terminal.
The hub is for the moments between sessions: an agent hits a question and you
answer it in one click, your work in one place, and the things you keep glancing
at sitting in the nav next to it, because you added them to a config file.

Free and open source, by Andrew Detwiler / [buildwithamemory.com](https://buildwithamemory.com).

> **Early.** This is not the finished product. What works: TODAY, the attention
> feed described below, the live stream, the wall, the browser pane, tabs, and the
> database under it all. What does not exist yet: the rooms behind BOARD, SESSIONS
> and JOBS, the module system, the hub building itself, and the update check
> described further down (the setting is there, the code that would use it is
> not). [Not built yet](#not-built-yet) lists those and how to ask for one. What
> is here is honest about what is not.

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

Four settings worth knowing about up front:

- **`bind.host`** is `127.0.0.1`, meaning this machine only. To reach the hub
  from your phone or another computer, the right answer is a private network
  (something like Tailscale) in front of it, not opening this up. The hub has no
  login, and that is only safe while it is not reachable.
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

Each link opens a prefilled issue. What gets asked for gets built, and reactions
on those issues are the only vote count there is. The same list is in the hub, at
the bottom of TODAY.

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
