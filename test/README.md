# Tests

```
npm test
```

`node --test`, which ships inside the Node 20+ this project already requires.
Zero dependencies, so this does not touch the "no new dependencies" rule: the
rule is about third-party packages, and there are none here.

## Never pass a path to `node --test`

The script is bare `node --test`, with no positional argument, and it has to
stay that way.

`node --test test/` shipped here first and it looked fine, because it IS fine on
Node 20 and Node 22, where a positional argument may be a directory. On Node 24
positional arguments are globs, `test/` matches nothing, and the run dies with
`Cannot find module .../test`. The suite stops running entirely on a machine
whose only difference is a newer Node inside the supported range.

Globs are not the fix either: `node --test "test/*.test.mjs"` fails on Node 20,
which has no glob support there, and an unquoted glob depends on shell expansion
that `cmd.exe` does not do. Bare `node --test` finds the same files on 20
through 24 on every platform, so that is the rule. `release-check.sh` fails the
build if a positional path ever comes back.

The bare form also picks up `_ts.mjs` (it lives under `test/`) as a file with no
tests in it, which is why the count reads one higher than the number of
assertions.

**The wider lesson, and the reason this cost anything: run the DOCUMENTED
command.** Two verify walks recorded a green `node --test` and neither ran
`npm test`, which is what every doc in this repo tells a contributor to type.

## Why these tests and not others

The load-bearing logic of the foundation is pure and cheap to test, and the
manual verify walk in `docs/verification/` is a one-time snapshot, not a gate.
So the net covers the four things a regression would hurt most:

- **`migrations.test.mjs`.** The mechanism that has to keep working against
  installs in the wild: fresh install, appending a second migration, an
  idempotent re-run, and the foreign-key rebuild that the schema comment tells
  the next author to perform.
- **`config.test.mjs`.** Every throw path of the loader, plus `~` expansion and
  the defaults-first behaviour on a missing and an empty file.
- **`serve-config.test.mjs`.** The boot script's verdict on the same files, so
  the two parsers cannot drift back into disagreeing about your config.
- **`time.test.mjs`.** The one formatter every surface shares.
- **`tabs.test.mjs`.** The extension seam, which is the first thing this product
  asks a stranger to edit, so every refusal message is pinned by its exact
  wording. It also covers the rule that keeps a folder tab safe: the folder comes
  from config and the path inside it comes from the request, asserted against a
  real symlink out of the folder rather than reasoned about in a comment.

## The TypeScript note

The modules under test are `.ts`. Node runs TypeScript directly from 22.6 (with
`--experimental-strip-types`) and by default from 23.6, but NOT on Node 20,
which this project still supports. Rather than add a build step or a loader
dependency, each test that imports a `.ts` module goes through `loadTs()` in
`_ts.mjs`, which SKIPS with a loud reason on a Node that cannot load it. A skip
is honest; a green run that silently tested nothing is not.

Modules under test are therefore kept free of project-internal imports where it
is cheap to do so (`src/lib/migrate.ts` imports only a type), because Node's
type stripping does not resolve extensionless relative imports the way the
bundler does.
