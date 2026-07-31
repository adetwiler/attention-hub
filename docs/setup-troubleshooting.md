# When setup goes wrong

The failures that have actually happened, what they look like, and how to tell
them apart. Each one is here because it cost somebody real time, and most of
them look like something else at first.

## "Ready" printed, and nothing is listening

**What you see.** The hub prints its startup lines and then Next prints its own
ready line. Everything looks like it worked. Then the browser cannot connect,
and `curl` says `000` or connection refused. Under a supervisor it is worse: the
service reports running, with a pid that keeps changing.

**What it usually is: your Node is below the floor.** The hub uses
`better-sqlite3`, a native module compiled against a specific Node. Below its
supported version it does not refuse politely. **It segfaults the process on the
first request that touches the database**, which is the first request you make.

**Why it is so confusing.** Three things line up against you:

- The crash lands **after** the ready line, so the last thing in your log is a
  success message.
- A signal death used to surface as a plain exit code 1, which reads like an
  ordinary error rather than a crash. That is fixed now: the launcher prints the
  signal name, so a `SIGSEGV` says so. Running Next directly shows the real
  status, 139.
- A supervisor with restart-always **respawns it**, so `launchctl` or
  `systemctl` reports a healthy running service while every request is refused.
  A moving pid is the tell.
- `curl` reporting connection refused sends most people to look at the bind
  address and the firewall, which are fine.

**The fix.**

```
node -v                        # what you are actually running
npm rebuild better-sqlite3     # after switching, and this is not optional
```

Switch to the Node version in `engines.node` in `package.json` or newer, then
rebuild. The rebuild matters: the binary on disk was compiled against the old
Node and will not load into the new one.

**You should not hit this any more.** `scripts/serve.mjs` now refuses to start
below the floor and tells you the version you have, the version you need, and
the rebuild command. If you got here past that check, it is worth an issue.

**Why the floor moved.** The hub declared `>=20` while its own dependency
declared `>=22`, so the manifest under-declared the real requirement and Node 20
looked supported. It never was. The preflight reads the floor **from
`package.json`** rather than repeating the number, so the two cannot drift
apart again.

## A version manager path in a service file

If you install the supervisor unit while using nvm, asdf, fnm or similar, the
node path written into it looks like:

```
~/.nvm/versions/node/v22.1.0/bin/node
```

**That path is pinned to one version.** The unit keeps working until you upgrade
Node, at which point the directory is gone, the service fails to start, and the
supervisor keeps retrying something that cannot succeed. Nothing warns you,
because from the supervisor's side the file is fine.

The installer prints a warning when it detects this. If you see it, either
re-run the installer after a Node upgrade, or point it at a stable path such as
a system or Homebrew install.

## The port is already taken

**What you see.** The hub exits with `EADDRINUSE`, or a managed copy dies
immediately and forever while a hand-started one runs happily.

**What it is.** Something already holds the port, usually a hub you started in a
terminal earlier. Under a supervisor this becomes a loop: the managed copy hits
the busy port, dies, gets restarted, and hits it again.

**The fix.** Stop the hand-started one first. The installers boot the service
out before bootstrapping it back in for exactly this reason, so re-running the
installer is a safe way to reset the state.

## The build is older than the code

**What you see.** You pulled an update, restarted, and a room the docs describe
returns 404.

**What it is.** Production serves a build, and a build can be stale.

**The fix.** Nothing. The hub compares the build against the source on every
production start and rebuilds when the source is newer, so this heals itself.
If you see it anyway, that is a bug worth an issue.

## Nothing appears when something files an item

Check, in this order:

1. **Are you looking at the same data folder?** The feed file lives under the
   configured data directory. A hub started from a different config reads a
   different file.
2. **Is the line valid?** The format is in
   [attention-feed.md](attention-feed.md). A malformed line is skipped rather
   than crashing the hub.
3. **Is it quiet hours?** Quiet hours suppress the pop-up and nothing else. The
   item is still on the list, oldest first. Default is 22:00 to 06:00, and there
   is a switch on the card.

## Reporting something not on this page

[Open an issue](https://github.com/adetwiler/attention-hub/issues). Include your
OS, `node -v`, and the last twenty lines of output. Nothing here reports
anything anywhere, so if you do not say it, nobody knows it.
