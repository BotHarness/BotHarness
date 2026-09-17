# AGENTS.md — DeepSeekBot

Project-specific guidance for AI coding agents.

## What this is

DeepSeekBot — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin: one DSH Host runs multiple Feishu/Lark bots, each with its own persona and **file-based memory** that persists across groups, threads, and sessions ("Bot as a Person").

- Product requirements: `PRD.md` — the single source of truth; decisions are recorded there with a changelog table.
- Base plugin we build on: [dsh-im](https://github.com/xmanrui/dsh-im) (multi-bot + settings UI). Reliability patterns from [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link); group/thread routing from [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge).
- Current phase: M0 done (repo + PRD + toolchain + skills); M1 next (base verification + plugin/Bot management UI).

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

Toolchain: pnpm 12.4.2 · Node ≥22 (`.node-version` = v24.21.0) · TypeScript 7 · oxlint · oxfmt · vitest · tsdown.
In WSL, use the fnm node and `corepack pnpm` — Windows pnpm cannot create symlinks on WSL paths.

## Conventions

- TypeScript ESM; tests live in `test/` (vitest).
- Never commit secrets: the Feishu App Secret goes to the DSH credentials service, never to config or the repo (PRD FR-8).
- Memory file rules (layout, atomic writes, tree injection, git versioning): see PRD §5.5, rules M1–M10.
- Record decisions in `PRD.md` (bump the version and changelog row) instead of leaving them in chat.
- Installed agent skills are third-party files under `.agents/skills/` — do not reformat them (locked by hash in `skills-lock.json`).

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `BotHarness/DeepSeekBot` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/` (seeded from PRD §5.2; extended lazily by the domain skills). See `docs/agents/domain.md`.
