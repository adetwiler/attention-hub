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
| [docs/adr/0004-pane-content-contract.md](adr/0004-pane-content-contract.md) | You are adding a kind of pane to the wall, or wondering why the content registry is a `Record` over a union. | internal |
| [docs/attention-feed.md](attention-feed.md) | Something needs to file an item for the human, or you are changing how items are read or written. THE public integration surface: the JSONL rows, the three kinds, the `hub` CLI and its exit codes. | public |
| [docs/adr/0005-attention-feed-append-only-jsonl.md](adr/0005-attention-feed-append-only-jsonl.md) | You are wondering why the feed is a file rather than an endpoint or a table, why it is polled rather than watched, or why two small rules are implemented twice. | internal |
| [.claude/skills/README.md](../.claude/skills/README.md) | You want the AI-session side of the feed: the skill that ships with the hub, and how to use it outside this repo. | public |
| [docs/tabs.md](tabs.md) | You are adding a tab, or you are about to tell a user how to extend the hub. The two kinds, the rules, the recipes, and the plain statement of why these docs stop at the config seam. | public |
| [prompt.txt](../prompt.txt) | The copy-paste setup prompt: the user hands it to their own AI, which reads the config example and writes their config. ONE copy lives here, CC0 per ADR-0001, and the setup page READS this file rather than embedding it, which is why no prompt-sync gate exists (`test/setup.test.mjs` asserts the one copy). | public |
| [docs/adr/0006-browser-pane-mirrors-a-real-browser.md](adr/0006-browser-pane-mirrors-a-real-browser.md) | You are wondering why a whole sidecar process exists to show a web page, why it is not an iframe, or how a browser pane squares with the no-telemetry promise. | internal |
| [docs/browser-pane.md](browser-pane.md) | You are touching `chrome/`, `src/lib/browser.ts`, the browser routes or `WebPane`. Every measured trap, and each one cost real time. Read it before changing any of them. | internal |
| [docs/adr/0007-terminal-sidecar-and-its-trust-model.md](adr/0007-terminal-sidecar-and-its-trust-model.md) | Before changing anything about the terminal: why it is a separate process, why tmux, why the grant, and the two rules about it that are permanent. | internal |
| [docs/terminal.md](terminal.md) | You are switching the terminal on, running the sidecar, or about to touch it. Setup, the security model, and four traps that all fail silently. | public |
| [docs/adr/0008-email-digest-is-the-users-own-outbound-call.md](adr/0008-email-digest-is-the-users-own-outbound-call.md) | You are touching anything that sends, or wondering how an email feature squares with a product that makes no network calls. Amends ADR-0002 decision 2. | internal |
| [docs/email-digest.md](email-digest.md) | You are switching the digest on, or about to tell a user what it does. How to configure it, what the provider can see, and how to turn it off. | public |
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
| `src/lib/feed.ts` | The attention feed CONTRACT, and nothing else. Imports nothing, so it is tested on its own. |
| `src/lib/attention.ts` | The feed where it meets the machine: reading the file, appending the answer, the ledger rows. |
| `src/lib/tabs.ts` | The extension seam: config into nav entries, and the one room behind a tab. Holds the containment rule that keeps a folder tab pointed where you pointed it. |
| `src/lib/setup.ts` | The setup steps, the one-paste agent prompts, and what your config says about each. Pure: the config arrives as an argument. Reads `prompt.txt` for the one prompt it does not own. |
| `src/app/setup/` | The setup page. Prompt first, manual underneath, the terminal warning in its own section. |
| `src/lib/quiet.ts` | Quiet hours, pure. The midnight wrap lives here. |
| `src/lib/settings.ts` | The settings table: live state that is not registry. |
| `src/lib/markdown.ts` | Markdown to HTML for documents shown in place. Read its header before touching it. |
| `scripts/hub.mjs` | The `hub` CLI. Dependency free, no TypeScript, works with the hub closed. Also holds `hub digest`, the email module, which is the ONE place in this repo that sends anything (ADR-0008). |
| `src/lib/sse.ts` | The stream route helper and the `?once=1` contract. |
| `src/components/useEventStream.ts` | One EventSource per page, with the poll fallback. |
| `src/lib/terminal.ts` | The terminal module's rules and its manifest. No I/O, so every refusal is tested. |
| `src/lib/terminalGrants.ts` | The grant store: mint, single-use redeem, prune. |
| `src/components/paneContent.tsx` | The pane content registry. One row per kind, exhaustive by type. |
| `pty/` | The terminal sidecar. Its OWN package, so a native module never reaches the app bundle. |
| `src/app/` | Rooms and API routes. |
| `src/lib/browser.ts` | The browser pane's hub side: what exists, what is seeded, what is installed, and the token grant. |
| `src/lib/weburl.ts` | What the address box means by what you typed. Imports nothing, because the server AND the client run it. |
| `chrome/` | The browser sidecar and its OWN `package.json`, so a WebSocket server never reaches the app bundle. Inside the network gate. |
| `deploy/browser/` | Optional service definition for the sidecar, GENERATED at install time, because a service needs absolute paths and this repo may not contain any. |
| `scripts/next-run.mjs` | The ONE place Next.js is launched. Where the telemetry switch lives. |
| `scripts/` | Start, build, and the config-first check. Dependency free. |
| `test/` | `node:test`. No dependencies, and it skips loudly rather than silently on a Node that cannot load TypeScript. |
| `.githooks/gate-lib.sh` | The fail-closed machinery every content gate shares. Read its header first. |
| `.githooks/` | The content gates. Install once per checkout. |
