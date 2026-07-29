# Tests

```
npm test
```

`node --test`, which ships inside the Node 20+ this project already requires.
Zero dependencies, so this does not touch the "no new dependencies" rule: the
rule is about third-party packages, and there are none here.

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
