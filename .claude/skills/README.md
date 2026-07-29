# The skills that ship with the hub

One so far: [`ask-the-human`](ask-the-human/SKILL.md), which teaches an AI
session to file something into the attention feed and read your answer back.

**It already works for any session running inside this repo**, because Claude
Code reads project skills from `.claude/skills/`. That is the maintainer's own
dogfooding path and it needs no setup.

**To make it available in every project you work in**, copy the folder into your
own skills directory:

```
cp -r .claude/skills/ask-the-human ~/.claude/skills/
```

On Windows, copy `.claude\skills\ask-the-human` into
`%USERPROFILE%\.claude\skills\`.

The skill calls the `hub` command. Put it on your PATH once with `npm link` from
the hub directory, or edit the two example command lines in the skill to point at
`node <path-to-attention-hub>/scripts/hub.mjs`.

Using something other than Claude Code? The skill is plain markdown, so it reads
as a perfectly good set of instructions for any tool: paste it into whatever your
tool calls a rule, a mode or a system prompt. The thing that actually matters is
the file format it wraps, and that is documented on its own in
[docs/attention-feed.md](../../docs/attention-feed.md).
