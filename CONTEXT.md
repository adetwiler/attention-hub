# Context: what the words mean here

The vocabulary of this project. If a term in the code or the docs does not
appear here and it should, add it.

## The domain

**Attention item.** Something that genuinely needs the human, right now. An
agent asking a question mid-run, a review waiting on a verdict, an update that
landed. The hub's whole reason for existing is to be the one place where these
gather, so nothing waits on you silently while you are somewhere else. An
attention item is answerable in place: the point is to unblock the work without
switching windows.

Attention items are NOT notifications. A notification tells you something
happened. An attention item is a thing you can act on, and it stays until you
act on it.

**The feed.** The append-only JSONL file attention items live in, and the
product's public integration surface: anything on the machine that can append a
line can file an item and read the answer back. Its path comes from
`attention.feed` in config and defaults inside `dataDir`. The full contract is
[docs/attention-feed.md](docs/attention-feed.md); the reasoning is
[ADR-0005](docs/adr/0005-attention-feed-append-only-jsonl.md).

**Ask row / answer row.** The two shapes in the feed. An ask row opens an item;
an answer row carries the same `id` and closes it. **Answers APPEND, and no row
is ever rewritten**, which is what lets a writing session and the reading hub
share the file with no lock. The first ask row for an id defines the item, and
the first closing row is the answer of record.

**Notice.** The third kind of item (`agent-notice`), and a distinction worth the
word: a REPORT filed through the same channel, which wants triage rather than an
answer. It is never labelled as asking you. A wall of rows claiming to ask you
things that are not asking you is how a needs-you surface stops being believed.

**Quiet hours.** One global flag (`manual` OR the schedule) that **suppresses
surfaces and never data.** While it is on, nothing pops up, the queue fills
normally, and when it lifts nothing back-fires: the morning list is simply the
list. Live state, so it lives in the settings table and not in config. Default
22:00 to 06:00 local, working with nothing configured.

**Arrival.** An item that appeared since the last snapshot. "New" is decided in
one place (`useArrivals`) with two halves: the FIRST snapshot is a baseline, never
a storm, and an item is new exactly once. Opening the hub onto nine waiting items
must not fire nine notifications.

**The ledger.** The `action_ledger` table. The single, complete record of every
mutation the hub has performed: who, what verb, against what target, with what
result, producing which artifacts and which commits. Not a log. The jobs strip,
the TODAY digest, undo, and attribution are all VIEWS of this one table. There
is deliberately no second history anywhere in the product, because two histories
means two answers to "what happened", and one of them is always wrong.

**Verb.** One thing the hub can do, recorded as one ledger row. A quick verb
finishes inside the request. A job does not.

**Job.** A long-running verb: a ledger row that carries a job spec, a pid and a
transcript. It outlives the request that started it, and the hub reattaches to
it after a restart. Still one ledger row, because there is one history.

**Artifact.** A file or URL an action produced, recorded on its ledger row. The
promise behind the word is that you never go hunting for the thing the hub just
made: it is a link on the row.

**Undoable.** Whether an action can be taken back. Undo is a git revert of
exactly the commits recorded on the row, which is why the commits are recorded.
Actions that reach outside your machine are not undoable and say so.

## The extension model

**Module.** A self-contained unit of hub functionality: a surface, its data, and
whatever it needs to run. The hub is a small core plus modules.

**Core module.** Ships with the hub, maintained by the project, updated when you
update. Core modules live in the tracked tree.

**User module.** Yours. Lives in `userDir` (default `user/`), which is
gitignored and which an update never touches, by construction rather than by
promise. This is the headline feature of the extension model, not an
implementation detail: you can build your own pages and the hub can still update
underneath you.

**Tab.** The smallest unit of making the hub yours, and the only one that ships
in v1: a name plus what it points at (a URL, or a directory), declared in
`hub.config.json`. It appears in the nav. You write no code. A tab owns no data
and has no lifecycle, which is exactly what separates it from a module, and the
reason it can exist before the module system does. Built in slice 14: `tabs` in
config, `src/lib/tabs.ts`, `/tab/<slug>`, and [docs/tabs.md](docs/tabs.md).
Because it is supported from day one, **the module system must not orphan it**.

A tab points at ONE thing. A row with both a `url` and a `dir`, or with neither,
is a config error naming the row, because picking one would put a surface on
screen that is not the one you described.

The word matters because "widget", "tab", "pane" and "module" get used
interchangeably in conversation and they are four different promises. A **pane**
is one cell of the wall. A **tab** is config. A **module** is code that owns a
surface. Anything described as a widget is one of those three, and saying which
is the point.

**User space.** Everything of yours that the hub must never overwrite:
`hub.config.json`, `userDir`, and `dataDir`. All three are gitignored, which is
why a plain `git pull` is a safe way to take an update.

**Self-build.** Asking the hub to change ITSELF, using your own AI tool: you
describe a surface you want, the hub runs your agent against its own source,
and the result arrives as a normal ledger row you can inspect and undo. This is
why the build has to be able to run without killing the instance serving you.

**Adapter.** The seam between the hub and one AI command-line tool. The hub is
vendor neutral: you name whatever tool you already use and pay for, in
`adapters` in your config. An adapter shipped without being exercised against a
real install is marked `untested`, and the UI says so rather than pretending.

## The browser pane

**Sidecar.** A small, separate, loopback-only process the hub talks to for
something a Next route cannot do. Today there is one: the browser sidecar
(`chrome/server.mjs`), which cannot be a route because a route handler cannot
perform a WebSocket upgrade. A sidecar has its own `package.json` so its
dependencies never reach the app bundle, and it always obeys the same three
rules: loopback only, a single-use token minted by the hub, and NO KILL PATH.

**Mirrored, not framed.** The browser pane shows a picture of a real browser tab
and forwards your input to it. It is not an iframe and never can be: a site's
`X-Frame-Options` header is the site's decision and no browser may override it,
so a framed pane could show almost nothing. The word matters because "the web
pane" sounds like an embed, and every property that makes this work (real logins,
sites that refuse framing, an extension able to drive the page you are looking
at) follows from it NOT being one.

**Browser profile.** One browser data directory the pane can mirror, declared in
`browser.profiles`. One profile is one signed-in identity, which is the whole
reason there is more than one. It is NOT the same thing as a **profile** in the
top-level `profiles` section: that is an account you work under, with your AI
tool's config directory. A browser profile carries a browser's own constraints (a
debugging port of its own, a singleton lock of its own, a one-time seeded copy),
which is why it is a separate list. By convention the ids match.

**Seeding.** The one-time copy of one of your real browser profiles into the
hub's own data directory (`scripts/seed-browser-profile.mjs`). It exists because
Chrome 136 stopped honouring `--remote-debugging-port` on the default data
directory, so the hub can never drive the browser you have open. Seeding is part
of the feature, not a rough edge, and an unseeded profile says so and names the
command.

**Parked.** Where the real browser window sits: off the side of the desktop, at
full size, still compositing. Distinct from MINIMIZED, which is the trap:
minimizing stops compositing and drops the mirror from about 92 fps to 0.3, which
looks exactly like a broken socket. Nothing in the hub ever minimizes a window,
and the pane's WINDOW button un-parks one so you can reach the browser's own UI
(an extension popup, a download, a file picker), which a picture of page pixels
can never carry.

## The mechanics

**Snapshot.** The one object every live surface renders (`LedgerSnapshot`).
Built server-side, diffed server-side, and delivered two ways that must never
diverge: the SSE stream, and `?once=1` returning the identical JSON.

**The poll fallback.** When the stream errors, the client polls `?once=1` until
a stream event arrives, then stops. Health is observed, never guessed.

**Room.** A top-level surface in the hub, one per nav entry: TODAY, the WALL,
BOARD, SESSIONS, JOBS. TODAY is the one you land in, and BOARD, SESSIONS and JOBS
are labelled not built rather than linking nowhere. **Your tabs are rooms too**
(`/tab/<slug>`), sitting after ours in the nav, which is the point: the seam is
not a second-class corner of the app. SETUP sits last and is deliberately not one
of the five: it is a page you need twice and then rarely, not a room you work in.

**The setup page.** `/setup`, and the answer to "how does a non-developer get
going". Every step LEADS WITH A PROMPT the user hands to their own AI tool, with
the manual version underneath, which is the product's premise applied to its own
setup. It absorbed the old `/tab` page in slice 8, because the tab seam is one
step of setup and two pages explaining one seam is two copies of the same words
waiting to disagree. The whole-config prompt is not embedded in it: the page
reads `prompt.txt` at request time, so the hero prompt has exactly one copy in
the tree and nothing can drift.

**Honest empty state.** A surface with no data says so, in plain words, and
never shows a sample row. A dashboard that greets a new user with invented data
teaches them not to trust it. This is a rule, not a preference.

**Degraded.** The other half of the rule above, and the half that is easy to
miss: a surface that CANNOT read its data is not empty, it is broken, and it has
to say which. `LedgerSnapshot.degraded` carries the reason on the same wire as
the data, so a hub that cannot open its own database renders a card explaining
that rather than a convincing "nothing is happening".

## The terminal

**Sidecar.** A small process the hub runs beside itself because the framework
cannot do the job in a route: today, exactly one, the pty sidecar (`pty/`). It
speaks WebSocket on loopback, owns the shells, and has its own `package.json` so
its native dependency never reaches the app bundle. A sidecar is not a service
you sign into and not a daemon that outlives your machine: it is part of the hub
that happens to need its own process, which is why it also needs its own service
definition to come back after a reboot.

**Grant.** One permission to open one shell: single use, valid for seconds,
minted by the hub for a named pane, and spent by the sidecar. It exists because a
port cannot be a permission. The browser is handed a token, the DATABASE holds
only its hash, and the sidecar has to ask the hub what the token is worth, which
is also how it learns which directory to open. So a grant is the thing that
decides what a shell may be, and the client never chooses.

**Session.** A `tmux` session named `<prefix>-<pane id>`, and the reason a shell
outlives the tab it was opened from. Navigation, a sidecar restart, a hub update
and a closed laptop all leave it running, and it is attachable from a real
terminal, which is the whole of the no-lockout contract: the hub can never be the
thing that traps a process, so it also never offers to kill one.

**Attach.** Joining a session that is already there, as opposed to starting one.
The distinction is load-bearing rather than pedantic: the client that CREATES a
session sets its size, and every attach after that must refuse to change it, or
a phone joining from the sofa collapses the desk layout. See
[docs/terminal.md](docs/terminal.md).

## The promises

**Local only.** The hub binds loopback and runs on your machine against your
database. There is no hosted version, no account, and no sign-in. It is also
single user today: teams is on the public roadmap and is not built. **macOS and
Linux** in v1, and Windows is not supported, which is a claim about the release
and not a licence to write POSIX-only code (see CLAUDE.md).

**No telemetry.** We hold none of your data. **This release makes zero outbound
calls of its own**: the release check is not built, so the claim is stronger than
"one call", not weaker. When that check lands it will tell GitHub nothing about
you beyond the fact that a request happened, which is your IP address and a user
agent, the same as any browser. Feedback happens through GitHub issues, which is
the only channel.

**The digest.** The one outbound path in the product, and it is the user's, not
ours: `hub digest` reads the feed and emails what is waiting, through a provider
they chose, with their key, on a schedule they wrote. Off by default, and it
lives in the CLI rather than in `src/` precisely so that "the hub itself
initiates nothing" stays literally true (ADR-0008). The word matters because
"the hub emails you" would describe a different product: nothing in the hub
decides to send anything.

**Untested.** Built to spec, never exercised, and saying so. The convention
started with adapters (`untested: true` on the row, and the UI says it) and now
covers a platform: Linux ships untested in v1, because the browser discovery
paths and the systemd unit were written from documented locations and never run.
Shipping something we have not exercised is fine. Implying we have is not.

**Production mode.** What a user gets by default. `./start.sh` builds once if it
has to and then serves the built app; `./start.sh dev` is the contributor mode.
Dev mode compiles on demand, watches files forever, and is the only mode with
the cross-origin dev block, so shipping users into it opts them into a failure
class that does not otherwise exist.
