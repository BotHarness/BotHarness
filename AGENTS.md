# AGENTS.md — BotHarness

Project-specific guidance for AI coding agents.

## What this is

BotHarness — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin layer that gives agents a persistent identity: **PersonaBots** with a persona and file-based memory that spans sessions, chats, and workspaces. **DeepSeekBot** is its first app (sidebar roster, delegation, IM adapters).

- Specs: `docs/botharness.md` (platform) and `PRD.md` (DeepSeekBot app); decisions live in `docs/adr/`.
- IM adapter base: [dsh-im](https://github.com/xmanrui/dsh-im) (multi-bot + settings UI). Reliability patterns from [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link); group/thread routing from [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge).
- Current phase: v1.0 baseline (spec restructure + ADR 0015–0018 + M1 scaffold merged); M1 BotHarness skeleton next (registry / bot home / state events).

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

Toolchain: pnpm 12.4.2 · Node ≥22 (`.node-version` = v24.21.0) · TypeScript 7 · oxlint · oxfmt · vitest · tsdown.
In WSL, use the fnm node and `corepack pnpm` — Windows pnpm cannot create symlinks on WSL paths.

## Conventions

- TypeScript ESM; tests live in `packages/*/test/` (vitest).
- Never commit secrets: the Feishu App Secret goes to the DSH credentials service, never to config or the repo (platform spec §4, rule M8).
- Memory rules (layout, front-matter, atomic writes, tree injection, visibility, git): see `docs/botharness.md` §4, rules M1–M11.
- Record decisions in the specs (bump version + changelog) and, for architecture, as an ADR under `docs/adr/` instead of leaving them in chat.
- Living architecture doc: `docs/architecture/botharness-architecture.md` (inline mermaid) — update it when modules, data flow, or boundaries change; it syncs to the docs site (`apps/docs`, botharness.ai) via `scripts/sync-docs.mjs`.
- Installed agent skills are third-party files under `.agents/skills/` — do not reformat them (locked by hash in `skills-lock.json`).
- Local docs dev: `pnpm dev` (portless → https://docs.botharness.localhost) or `pnpm docs:dev` (http://localhost:4321); `syncDocs()` runs at Astro config load, so plain `astro dev`/`astro build` also works.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `BotHarness/BotHarness` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/` (extended lazily by the domain skills). See `docs/agents/domain.md`.
