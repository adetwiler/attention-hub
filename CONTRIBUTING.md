# Contributing

Thanks for looking. Two things to do before your first commit, then the usual.

## 1. Arm the gates (once per checkout)

```
bash .githooks/install.sh
```

Git does not carry hooks: `.git/hooks/` is per-clone local state that no clone
or pull brings along. So the hook files live in the tracked `.githooks/`
directory, and that one command points your git at them by setting
`core.hooksPath`. That is the entire mechanism.

**Run it again in every new worktree.** A worktree starts without a denylist,
and the hook correctly refuses every commit until it has one. That is the
intended behaviour, not a broken repo, but it does read like one the first time.

What the hook blocks, over your STAGED ADDITIONS only, so an old line somewhere
else in a file you touched never blocks an unrelated commit:

1. **Em dashes.** Use a period, a comma, a colon, or parentheses.
2. **Denylisted terms.** Your personal paths, keys, and internal names. The list
   lives in `.githooks/denylist.local`, which is gitignored. `install.sh` copies
   `denylist.example` for you, and **the hook refuses to run against the
   unedited copy**: a placeholder that passes a non-empty check while protecting
   nothing is worse than no gate, because it looks armed.
3. **Home paths and email addresses, in ANY file.** Not just code. A path pasted
   out of a terminal and a real address land in a README far more often than in
   a source file, and a README is what a stranger reads first. Use `~` or a
   reserved documentation domain (`example.com`).
4. **Outbound network calls under `src/` and `scripts/`.** This product promises
   it sends nothing about its users anywhere, so the rule is REACH, not a list
   of known-bad library names: any non-loopback URL, any import of a
   network-capable module, and any shell-out to curl or wget is blocked. Two
   markers get you past it, and both must sit **on the same line**, because the
   gate reads one line at a time:
   - `// hub-allow-network: <why>` the line really does open a connection.
   - `// hub-no-request: <why>` the line only mentions a URL and sends nothing.
5. **Absolute paths under `src/` and `scripts/`.** Every path and port comes
   from `hub.config.json`.
6. **Anything hiding in a staged binary.** Binaries are invisible to a diff and
   to `grep`, so their printable strings get scanned too. That is how a
   screenshot with metadata or a stray database reaches a public repo while
   every gate reports green.

The real denylist is never committed, on purpose: publishing your content
scanner must never publish the list of things you are keeping out.

**If a gate cannot run, it refuses.** One unbalanced parenthesis in a company
name in your denylist makes `grep` exit 2, and a careless `|| true` would swallow
both the error and the exit code so every commit passed with no output at all.
A CRLF-saved denylist has the same effect for the same invisible reason. Both
are closed in `.githooks/gate-lib.sh`, which also feeds every plain-literal term
back through the assembled pattern on every run, so the gate proves itself
instead of assuming.

## 2. Run the checks

```
npm run typecheck
npm run check
npm test
npm run build:check
bash .githooks/release-check.sh
```

The release check is the whole-tree backstop the per-commit hook cannot be: it
scans every tracked file for denylisted terms, email addresses, home paths and
em dashes, scans binaries through their printable strings, re-runs the
config-first check, verifies markdown links resolve, checks the example config
still has the shape the loader expects, asserts the three copies of the default
port agree, and refuses if any `package.json` script spawns Next.js outside the
one boot path that disables its telemetry.

It only sees TRACKED files. Green means "what would ship is clean", not "your
working directory is clean". Every check in it is offline by design: a gate that
needs the network is a gate that gets skipped.

## House rules

- **TypeScript strict, never `any`.** Use `unknown` and narrow it.
- **No new dependencies** without a conversation. The list is `next`, `react`,
  `react-dom`, `better-sqlite3`, `marked`, and that is the whole point. No CSS
  framework, no component library, no ORM. Tests run on `node:test`, which is
  part of Node, so they cost nothing against this rule. See
  [test/README.md](test/README.md).
- **Windows users are first class.** No shell-string spawning, no POSIX-only
  paths, no inline `PREFIX=value` in npm scripts. Line endings are pinned in
  `.gitattributes` and the reason is written there.
- **Honest empty states.** A surface with no data says so. Never ship sample
  rows.
- **Read [CLAUDE.md](CLAUDE.md) first**, then
  [docs/context-map.md](docs/context-map.md) to find whatever else you need.

## Reporting something

[GitHub issues](https://github.com/adetwiler/attention-hub/issues). It is the
only feedback channel, by design: there is no telemetry telling us anything
went wrong, so if you do not say it, nobody knows.
