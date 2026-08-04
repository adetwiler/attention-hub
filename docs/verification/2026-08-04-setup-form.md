# The setup form, walked (2026-08-04)

OPEN item 0-Z: `/setup` reads as a chore list. The fix inverts the page, so the
thing worth verifying is not "does the page render" but "does Save actually
change the file, and does it refuse everything it claims to refuse".

**Target: `npm run dev`, on the working tree at `ef4a31f`.** Named because the
target matters as much as the assertions: a smoke run against a stale production
build is a false green, which is worse than no gate. This was dev, watching the
tree these changes are in.

## The machine gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run check` | clean, 74 files |
| `npm test` | 224 pass, 0 fail (17 of them new) |
| `npm run build:check` | compiled, and `/api/setup` is in the route table |
| `npm run smoke` | 5 of 5 routes, no console errors |

## The gates were made to go red on purpose

A gate that has never failed is not a gate, so both new ones were broken
deliberately and put back.

- **The security assertion.** Disabling the "may only pick a declared agent"
  check in `checkSetupValues` turns `THE PICKER CANNOT NAME A NEW BINARY` red.
- **The smoke selector.** Renaming the form's own class turns `/setup` red with
  `expected element not found: .setup-form`, and every other route stays green.
  That is the point of the selector: without it, the page could quietly go back
  to being the reading assignment it was and nothing would notice.

## The save, driven for real

Against the running hub, with a local `hub.config.json` that declares no AI tools.
Every one of these is the route's own answer, not a unit test's.

| What was sent | What came back |
|---|---|
| POST with `Origin: https://evil.example` | 403, nothing written |
| POST with no `Origin` at all | 403, nothing written |
| POST with `port: 70000`, same origin | 400, "A port is a whole number between 1 and 65535." |
| POST naming `/usr/bin/curl` as the AI tool | 400, "This form can only pick between the AI tools your config already declares" |
| POST with a name, `~/hub-data` and a new port | 200, and the file changed |

**What the file looked like afterwards**, which is the assertion that matters,
because a 200 is delivery and not correctness:

- `hub.name`, `dataDir` and `bind.port` were the submitted values.
- `hub.actor` survived. So did every `$comment`, and so did every section the
  form does not own.
- Key order was unchanged, which is what keeps a `$comment` sitting above the key
  it describes.

**The ledger recorded all of it.** One `configure` row per attempt: `done` for
the save, `failed` for the two refused ones. Nothing the hub did is invisible
afterwards, including the things it refused to do.

The local config was then restored byte for byte (2927 bytes, 42 lines) and
re-checked.

## Not verified here, and it needs a human

Nobody has typed into the form in a real browser and pressed Save. Headless
Chrome proves it mounts and that the fields are there; a person proves the tab
order, the picker on a touch screen, and whether the saved message reads as
reassuring or as a shrug. That is one line on the owner's existing Chrome walk.
