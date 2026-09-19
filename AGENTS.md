# AGENTS.md — BotHarness

Project-specific guidance for AI coding agents.

## What this is

BotHarness — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin layer that gives agents a persistent identity: **PersonaBots** with a persona and file-based memory that spans sessions, chats, and workspaces. **DeepSeekBot** is its first app (sidebar roster, delegation, IM adapters).

- DSH official docs (source of truth when DSH behavior/APIs are in question): <https://deepseek-harness.github.io/deepseek-harness/> — plugin authoring, packaging and install under `/develop/basic/` (`/publish` documents `dsh plugin`, bundle/profile manifests and layer order); CLI behavior reference upstream at `apps/cli/reference/README.md`.
- Specs: `docs/botharness.md` (platform) and `PRD.md` (DeepSeekBot app); decisions live in `docs/adr/`.
- IM adapter base: [dsh-im](https://github.com/xmanrui/dsh-im) (multi-bot + settings UI). Reliability patterns from [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link); group/thread routing from [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge).
- Current phase: v1.9 spec (chat-first bot mode, ADRs 0029/0030, 0026 update); M2 memory MVP merged (PR #22); M3 bot-mode IA + chat shell (#10); M3.5 install gate (#24); M4 demo (#11); Bot Inbox / Orchestrator / Channel tools / Bridges in v1.1 (#30); M6 SoulSnapshot (#17) / M7 registry (#18) planned; docs IA rework deferred (#26).

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

Toolchain: pnpm 12.4.2 · Node ≥22 (`.node-version` = v24.21.0) · TypeScript 7 · oxlint · oxfmt · vitest · tsdown.
In WSL, use the fnm node and `corepack pnpm` — Windows pnpm cannot create symlinks on WSL paths.
Local dev loop (M3.5 pulled forward): install the local bundle into a `web-dev` profile and run `dsh web --profile web-dev` (pinned `0.1.5-rc.2`, isolated `DSH_HOME`); rebuild the client bundle with `pnpm build` — `dsh-client-hmr` pushes the new revision, and Host-side changes ride Cordis HMR. Details: `docs/client-bridge.md` §7.

## Conventions

- TypeScript ESM; tests live in `packages/*/test/` (vitest).
- Never commit secrets: the Feishu App Secret goes to the DSH credentials service, never to config or the repo (platform spec §4, rule M8).
- Memory rules (layout, front-matter, atomic writes, tree injection, visibility, git): see `docs/botharness.md` §4, rules M1–M11.
- Record decisions in the specs (bump version + changelog) and, for architecture, as an ADR under `docs/adr/` instead of leaving them in chat.
- Living architecture doc: `docs/architecture/botharness-architecture.md` (inline mermaid) — update it when modules, data flow, or boundaries change; it syncs to the docs site (`apps/docs`, botharness.ai) via `scripts/sync-docs.mjs`.
- Docs site: Nimbus in `apps/docs` — content is generated from repo sources by `scripts/sync-docs.mjs` (never edit generated files); sections are `/docs` (user guides) and `/dev` (spec / PRD / ADR / architecture). English is primary at the root; Chinese lives under `/zh/**` (machine-translated, human spot-checked). The landing page uses **coss ui** (`src/components/coss/`, brand tokens in `design/tokens.css`); docs pages use Nimbus UI.
- Diagrams: edit `docs/architecture/diagrams/*.mmd`, run `pnpm diagrams`, and commit the rendered light/dark SVGs (`rendered/*.svg`); the architecture page embeds those committed SVGs via the `<Diagram>` component, while the runtime mermaid loader remains for ad-hoc `mermaid` fences in hand-authored content.
- OG cards: `apps/docs/src/pages/og/**` renders at build time with CanvasKit; Chinese titles use the committed Noto Sans SC subset. After editing Chinese page copy, run `pnpm og:font` (needs network) to regenerate `apps/docs/public/fonts/NotoSansSC-Bold.og-subset.otf`.
- Installed agent skills are third-party files under `.agents/skills/` — do not reformat them (locked by hash in `skills-lock.json`).
- Local docs dev: `pnpm dev` (portless from `apps/docs` → https://docs.botharness.localhost; no-sudo variant `PORTLESS_PORT=8788 PORTLESS_HTTPS=0`) or `pnpm docs:dev` (http://localhost:4321); `syncDocs()` runs at Astro config load, so plain `astro dev`/`astro build` also works.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `BotHarness/BotHarness` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Pull requests

When creating or updating a PR, use the `visual-pr` skill to write the description: one-sentence "why", `/show-me`-style change outline, saved under `.humanlayer/tasks/` and applied with `gh pr edit --body-file`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/` (extended lazily by the domain skills). See `docs/agents/domain.md`.

### UI guidelines

Building or changing in-harness UI follows the `dsh-ui` skill: DSH tokens, `ui-primitives`, the native inset contract, and the measure-the-shell workflow (ADR-0028).

### DSH development

Developing, running, or debugging against a local DSH instance follows the `dsh-dev` skill: dev-loop/profile operations, the `/api` transport contract (api-gateway owns the single interceptor — never `connection.rpc.intercept('/api')`), and the headless debugging playbook. Diagnosed DSH traps must be recorded there in the same change (pitfall log).
