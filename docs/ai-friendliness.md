# Being AI-friendly, as the term stands in July 2026

Researched 2026-07-30 because "make it AI-friendly" means something specific now and the
specifics moved fast. Sources at the bottom. This is the standard the hub builds against.

The short version: **AI-friendly in 2026 is not a marketing file, it is an interface.** The
things that measurably help are the ones an agent can call or read deterministically. The
things that mostly do not help are the ones written to be discovered by crawlers.

## The four layers, and which ones this hub owes

Current framing treats these as complementary layers rather than competitors, and a product
that wants agents to use it well ends up wanting all four:

| Layer | What it is | Does the hub need it |
|---|---|---|
| `AGENTS.md` | Instructions for a coding agent standing in the repo | **Yes, highest value.** People clone this |
| Skills (`SKILL.md`) | A packaged, reusable capability with frontmatter and scripts | **Yes**, for the hub's own operations |
| `llms.txt` | A routing file: what is worth reading, with descriptions | **Yes**, for the docs, for the right reason |
| MCP server | Runtime tools an agent can actually call | **Yes, and this is the big one** |

### 1. AGENTS.md is now the de facto convention, and it is cheap

Formalised as an open spec in August 2025, **donated to the Linux Foundation's Agentic AI
Foundation in December 2025**, adopted by **60,000+ repositories** and read natively by
**30+ tools** including Claude Code, Copilot, Cursor, Codex, Gemini CLI, Windsurf, Devin,
Aider and Amazon Q. For a repo strangers clone and then point their own agent at, this is the
single highest-leverage file in the project.

What the field guidance actually says, which cuts against instinct:
- **Shorter and accurate beats comprehensive and generic.** Start at 30 to 50 lines: stack,
  build commands, code style with examples, and boundaries. Add a section only when an agent
  repeatedly makes a specific mistake.
- **Spend the words on what is underrepresented in training data.** Agents already know npm
  and pytest. They do not know this hub's user-space rule or its theme contract.
- **Treat it as code.** Commit it, review it, prune it. One vendor eval reported a bad file
  dropping task completeness by 30 percent, so this file can actively hurt.
- Keep a thin `CLAUDE.md` that points at `AGENTS.md` rather than duplicating it.

Caveat to hold honestly: these instructions are **advisory, not enforced**. An agent may skip
what it judges unnecessary. Anything that must not be skipped belongs in a hook or a gate, not
in a markdown file.

### 2. llms.txt: ship it, but for the defensible reason

Roughly 40,000+ implementations and about 10% of sites, with Anthropic, Stripe, Cloudflare,
Vercel, Supabase and others publishing one. But the marketing premise does not hold up: the
major crawlers do not fetch it in meaningful volume, no major AI company has publicly
committed to acting on it in production, and one study found that removing llms.txt from a
citation-prediction model **improved** accuracy, meaning it was noise rather than signal.

Where it genuinely works is exactly this product's situation: **IDE and CLI agents fetch it
routinely** when pointed at a docs site (Cursor, Windsurf, Claude Code, Copilot, Cline,
Aider). So the hub ships `llms.txt` plus `llms-full.txt` as a token-efficient docs index for
the user's own agent, and makes no claim about visibility.

Anti-patterns to avoid, all of them easy to fall into:
- a sitemap with no descriptions
- vague link text
- a stale file pointing at moved pages
- an `llms-full.txt` with no token budget, big enough to swamp the context it was meant to help

### 3. An MCP server is the part that actually makes this hub agent-native

This is the difference between an agent reading about the hub and an agent USING it. The hub
already holds the things an agent wants: what needs attention, what is running, projects,
files, checklists. Exposed as MCP tools, the user's own agent can ask "what needs me" and
"tick that item" without scraping a page.

Published architecture patterns (arXiv 2606.30317, fifteen servers surveyed) name five, and
two fit here: **Resource Gateway** (read-side: attention items, projects, checklists) and
**Domain-Specific Adapter** (write-side: create a project, tick an item, raise an attention
row). A **Stateful Session Server** is what the terminal room would need and is post-v1.

Constraint that keeps this honest: the hub promises zero outbound calls. An MCP server is
**inbound and local**, a socket on this machine that the user's own agent connects to. That
does not violate the promise, and the README must say so precisely, because "MCP" reads as
"cloud" to plenty of people.

## What this means concretely for the hub

1. `AGENTS.md` at the root, 30 to 50 lines, with the user-space rule, the theme contract, the
   config-is-the-only-source-of-paths rule, and the gates. Thin `CLAUDE.md` pointing at it.
2. `llms.txt` and a budgeted `llms-full.txt` generated from `docs/`, regenerated on release so
   they cannot go stale.
3. A local MCP server exposing read tools first (attention, projects, checklists, jobs) and a
   small set of write tools, documented as inbound-only and local-only.
4. Every surface an agent might drive gets a **stable JSON route**, so nothing has to be
   scraped out of HTML.
5. Extension points stay declarative and in user space: tabs in config, themes as a CSS file,
   modules later. An agent can add a tab or a theme by writing one file, which is the same
   path a human takes.

## Sources

- [AGENTS.md field guide, 2026 edition](https://www.iuriio.com/blog/posts/2026/05/agents-md-field-guide-2026)
- [The agent-native repo: why AGENTS.md is the new standard](https://www.harness.io/blog/the-agent-native-repo-why-agents-md-is-the-new-standard)
- [AGENTS.md complete guide 2026](https://codersera.com/blog/agents-md-complete-guide-2026/)
- [How to build your AGENTS.md](https://www.augmentcode.com/guides/how-to-build-agents-md)
- [llms.txt explained, May 2026: spec, adoption, how to ship one](https://codersera.com/blog/llms-txt-complete-guide-2026/)
- [llms.txt in 2026: adoption data and when to use it](https://organikpi.com/blog/distribution/llms-txt-adoption-impact/)
- [MCP server architecture patterns for LLM-integrated applications (arXiv 2606.30317)](https://arxiv.org/abs/2606.30317)
- [MCP vs llms.txt vs agent skills: comparison](https://signb.ee/blog/multi-protocol-future-mcp-skills-llmstxt)
- [Using llms.txt with MCP](https://llmgenerator.com/blog/using-llms-txt-with-mcp/)
