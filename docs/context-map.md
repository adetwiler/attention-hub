# Context map

The map of maps. Read THIS to find the right file, then open only that one.
Front-loading every doc every session is the thing this file exists to avoid.

`public` = a stranger who clones the repo reads it.
`internal` = written for whoever is building the hub.

| File | Read it when | Audience |
|---|---|---|
| [CLAUDE.md](../CLAUDE.md) | Every session. The rules that are not negotiable. | internal |
| [CONTEXT.md](../CONTEXT.md) | A term is unclear: attention item, module, adapter, the ledger, self-build. | internal |
| [OPEN.md](../OPEN.md) | Before deciding anything that looks already decided. Open questions and their owners. | internal |
| [README.md](../README.md) | You are a user, or you are about to change what users are told. | public |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | You just cloned this, or you just made a worktree and every commit is being refused. | public |
| [LICENSE](../LICENSE) | Licensing. MIT. | public |
| [docs/adr/0001-mit-license-cc0-setup-prompt.md](adr/0001-mit-license-cc0-setup-prompt.md) | Why MIT, why CC0 on the setup prompt, why attribution is a product feature and not a licence term. | internal |
| [docs/adr/0002-hub-architecture.md](adr/0002-hub-architecture.md) | Before changing the spine, or when a decision looks arbitrary: local-only, no telemetry, config-first, ledger-as-history, user-space separation, multi-adapter. | internal |
| [docs/adr/0003-tab-seam-over-module-system-for-v1.md](adr/0003-tab-seam-over-module-system-for-v1.md) | You are about to build the extension story, or wondering why a `tabs` array exists next to a planned module system. The three marketing beats, the seam v1 ships, and why the setup wizard is a prompt. | internal |
| [docs/claude/architecture.md](claude/architecture.md) | You are writing code in `src/`. How the files fit, where your slice plugs in, and the traps already paid for. | internal |
| [docs/claude/parallel-agent-builds.md](claude/parallel-agent-builds.md) | You are about to start a slice while someone else is mid-slice, or you are dispatching more than one agent at this repo. The claim label, worktrees, gate install, and who owns the shell files. | internal |
| [test/README.md](../test/README.md) | You are adding a test, or wondering why there is no test framework dependency. | internal |
| [docs/verification/](verification/) | You want to know what was actually walked, and what was not. One file per walk, newest last. | internal |
| [docs/mocks/buildwithamemory-front-page.html](mocks/buildwithamemory-front-page.html) | You are changing the hub's look, or the site section that announces it. Owner-approved design truth, including the embedded hub screenshot the shell is built to. | internal |
| [docs/marketing/README.md](marketing/README.md) | You are about to take, place, or publish a screenshot of the hub. The eligibility rule, the five-asset set, and why no raw frame lives in this repo. | internal |
| [docs/marketing/screenshots.manifest.json](marketing/screenshots.manifest.json) | You are capturing shots. The recipe: demo profile, presets, targets, redaction patterns. | internal |
| [hub.config.example.json](../hub.config.example.json) | You need to know what a setting does. Every key carries a `$comment`. | public |

## The code, by responsibility

| Where | What it owns |
|---|---|
| `src/lib/config.ts` | The registry. Every path and port in the product. |
| `src/lib/db.ts` | The SQLite connection and the ledger queries. |
| `src/lib/migrate.ts` | The schema and the migration runner. Imports only a type, so it is testable on its own. |
| `src/lib/ledger.ts` | The one wrapper every mutation runs through. |
| `src/lib/stream.ts` | The one snapshot every live surface renders. |
| `src/lib/sse.ts` | The stream route helper and the `?once=1` contract. |
| `src/components/useEventStream.ts` | One EventSource per page, with the poll fallback. |
| `src/app/` | Rooms and API routes. |
| `scripts/next-run.mjs` | The ONE place Next.js is launched. Where the telemetry switch lives. |
| `scripts/` | Start, build, and the config-first check. Dependency free. |
| `test/` | `node:test`. No dependencies, and it skips loudly rather than silently on a Node that cannot load TypeScript. |
| `.githooks/gate-lib.sh` | The fail-closed machinery every content gate shares. Read its header first. |
| `.githooks/` | The content gates. Install once per checkout. |
