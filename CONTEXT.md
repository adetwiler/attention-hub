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
reason it can exist before the module system does.

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

## The mechanics

**Snapshot.** The one object every live surface renders (`LedgerSnapshot`).
Built server-side, diffed server-side, and delivered two ways that must never
diverge: the SSE stream, and `?once=1` returning the identical JSON.

**The poll fallback.** When the stream errors, the client polls `?once=1` until
a stream event arrives, then stops. Health is observed, never guessed.

**Room.** A top-level surface in the hub, one per nav entry: TODAY, BOARD,
SESSIONS, JOBS. TODAY is the one you land in.

**Honest empty state.** A surface with no data says so, in plain words, and
never shows a sample row. A dashboard that greets a new user with invented data
teaches them not to trust it. This is a rule, not a preference.

**Degraded.** The other half of the rule above, and the half that is easy to
miss: a surface that CANNOT read its data is not empty, it is broken, and it has
to say which. `LedgerSnapshot.degraded` carries the reason on the same wire as
the data, so a hub that cannot open its own database renders a card explaining
that rather than a convincing "nothing is happening".

## The promises

**Local only.** The hub binds loopback and runs on your machine against your
database. There is no hosted version, no account, and no sign-in. It is also
single user today: teams is on the public roadmap and is not built.

**No telemetry.** We hold none of your data. The only network call the product
will ever make is the daily check for a new release (not built yet), and it
tells GitHub nothing about you beyond the fact that a request happened, which is
your IP address and a user agent, the same as any browser. Feedback happens
through GitHub issues, which is the only channel.

**Production mode.** What a user gets by default. `./start.sh` builds once if it
has to and then serves the built app; `./start.sh dev` is the contributor mode.
Dev mode compiles on demand, watches files forever, and is the only mode with
the cross-origin dev block, so shipping users into it opts them into a failure
class that does not otherwise exist.
