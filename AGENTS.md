# AGENTS.md — BotHarness

Project-specific guidance for AI coding agents.

## What this is

BotHarness — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin layer that gives agents a persistent identity: **PersonaBots** with a persona and file-based memory that spans sessions, chats, and workspaces. **DeepSeekBot** is its first app (sidebar roster, delegation, IM adapters).

- DSH official docs (source of truth when DSH behavior/APIs are in question): <https://deepseek-harness.github.io/deepseek-harness/> — plugin authoring, packaging and install under `/develop/basic/` (`/publish` documents `dsh plugin`, bundle/profile manifests and layer order); CLI behavior reference upstream at `apps/cli/reference/README.md`.
- Product language: `CONTEXT.md` (English) and `CONTEXT.zh.md` (Chinese); integrated target architecture: `docs/architecture/botharness-architecture.md`; durable choices and rationale: `docs/adr/`. The old platform spec and app PRD are archived working drafts, not parallel authorities.
- IM adapter base: [dsh-im](https://github.com/xmanrui/dsh-im) (multi-bot + settings UI). Reliability patterns from [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link); group/thread routing from [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge).
- Current architecture baseline: ADR-0035–0045 and the living architecture; delivery status and sequencing live in GitHub Issues and Projects.

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

Toolchain: pnpm 12.4.2 · Node ≥22 (`.node-version` = v24.21.0) · TypeScript 7 · oxlint · oxfmt · vitest · tsdown.
In WSL, use the fnm node and `corepack pnpm` — Windows pnpm cannot create symlinks on WSL paths.
Local dev loop (M3.5 pulled forward): install the local bundle into a `web-dev` profile and run `dsh web --profile web-dev` (pinned `0.1.5-rc.2`, isolated `DSH_HOME`); rebuild the client bundle with `pnpm build` — `dsh-client-hmr` pushes the new revision, and Host-side changes ride Cordis HMR. Details: `docs/client-bridge.md` §7. Agents boot an isolated, verified instance with `node scripts/dev-instance.mjs --home <path> --port <n> [--worktree <path>] [--build]`; it links that worktree, installs the profile, injects the machine-local `DEEPSEEK_API_KEY` (env > `~/.config/botharness/dev.env` > Keychain `botharness-deepseek`; `node scripts/dev-secret.mjs check` reports the source) and prints the one-shot token URL after probing `/api`. Secrets stay machine-local and never enter the repo.

## Conventions

- TypeScript ESM; tests live in `packages/*/test/` (vitest).
- Never commit secrets: the Feishu App Secret goes to the DSH credentials service, never to config or the repo (ADR-0006).
- Memory terminology lives in `CONTEXT.md`; durable memory choices live in ADR-0002/0003/0004/0012/0014/0021 and are integrated into the living architecture.
- Record durable architecture choices as ADRs under `docs/adr/`, then integrate their current result into the living architecture instead of leaving decisions in chat or a mutable PRD.
- Living architecture doc: `docs/architecture/botharness-architecture.md` (inline mermaid) — update it when modules, data flow, or boundaries change; it syncs to the docs site (`apps/docs`, botharness.ai) via `scripts/sync-docs.mjs`.
- Docs site: Nimbus in `apps/docs` — content is generated from repo sources by `scripts/sync-docs.mjs` (never edit generated files); sections are `/docs` (user guides), `/dsh` (stable DSH/Cordis Context + Decision Tree, generated from `dsh-plugin-dev`) and `/dev` (BotHarness Design / verified Guides / code-generated Reference / ADR). Design is normative target state; Reference is current implementation fact. English is primary at the root; maintained Chinese counterparts live under `/zh/**`. Every docs page exposes a clean `.md` sibling; the legacy `/index.md` form remains compatible. The landing page uses **coss ui** (`src/components/coss/`, brand tokens in `design/tokens.css`); docs pages use Nimbus UI.
- Diagrams: edit `docs/architecture/diagrams/*.mmd`, run `pnpm diagrams`, and commit the rendered light/dark SVGs (`rendered/*.svg`); the architecture page embeds those committed SVGs via the `<Diagram>` component, while the runtime mermaid loader remains for ad-hoc `mermaid` fences in hand-authored content.
- OG cards: `apps/docs/src/pages/og/**` renders at build time with CanvasKit; Chinese titles use the committed Noto Sans SC subset. After editing Chinese page copy, run `pnpm og:font` (needs network) to regenerate `apps/docs/public/fonts/NotoSansSC-Bold.og-subset.otf`.
- Installed agent skills are third-party files under `.agents/skills/` — do not reformat them (locked by hash in `skills-lock.json`). First-party skills live in the same tree and are ours to edit — `dsh-plugin-dev` (stable DSH/Cordis Context and Decision Tree), `dsh-dev`, and `dsh-ui` (all symlinked into `.claude/skills/`, not in the lock file).
- Local docs dev: `pnpm dev` (portless from `apps/docs` → https://docs.botharness.localhost; no-sudo variant `PORTLESS_PORT=8788 PORTLESS_HTTPS=0`) or `pnpm docs:dev` (http://localhost:4321); `syncDocs()` runs at Astro config load, so plain `astro dev`/`astro build` also works.

### Developer diagnostics (AX)

Agent-facing debugging is a first-class concern. A plugin that owns long-running or external resources (containers, adapters, schedulers, external commands) records structured, bounded developer logs for its lifecycle transitions — initiator, phase, duration, external command summary, refusal reason — on a log surface that both Humans and agents can read, instead of ad-hoc `console` output. Messages stay stable and machine-parseable, never contain secrets, and remain process evidence rather than a second durable authority. The long-term tracing plan lives in [#160](https://github.com/BotHarness/BotHarness/issues/160); `CLAUDE.md` inherits this section because it delegates to `AGENTS.md`.

WSL egress fallback: if a task-local DSH Host cannot reach a provider while Windows can, follow [the AX restricted-relay runbook](docs/agents/ax-wsl-network.md) for standing authorization, isolation, live-model proof, and lifecycle.

## Delivery workflow — tracer bullets

For a feature that crosses layers, deliver a sequence of **tracer bullets**: the smallest production-shaped end-to-end slice that reaches the owning Host module, durable authority, adapter/RPC, Client surface, and a Human-testable runtime path. Validate that slice before expanding the next one. This follows the [tracer-bullet practice](https://www.aihero.dev/tracer-bullets): build one narrow vertical path, test it immediately, get feedback, then extend it.

- Start from one observable user behavior, not a complete horizontal layer. Implement only the contracts and data needed to exercise that behavior through the real architecture.
- Keep authority boundaries real in the first slice. A demo path still uses the owning deep module, canonical persistence, trusted adapter context, and existing Host↔Client seam; it does not introduce a temporary second store or lifecycle.
- Include the smallest useful Host behavior and Client interaction together whenever the feature has both. A backend-only foundation or disconnected UI mock is preparatory work, not a completed tracer bullet.
- End each slice with focused automated coverage plus a runnable verification path. For in-harness UI, provide a state the Human can open, operate, and judge; capture evidence when the issue or PR requires it.
- Seek Human feedback after the first working slice before broadening sibling views, providers, variants, policies, or edge cases.
- Order issues and sub-issues by runnable vertical slices. Open research or grilling only when an unresolved decision blocks the next slice; defer speculative branches that would only create more unvalidated tickets.
- A slice is complete when one coherent behavior works end-to-end through production seams and its regression is observable automatically. Then start the next slice with a fresh, narrow scope.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `BotHarness/BotHarness` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Release Ledger

DeepSeekBot release notes use the bilingual canonical Release Ledger in `CHANGELOG.md` and `CHANGELOG.zh.md`. For a user-visible change, public documentation change, release PR, revert, or prerelease, follow `docs/agents/changelog.md`; keep both ledgers structurally aligned and run `pnpm changelog:check`.

For a DSH Skill behavior or public-documentation change, release PR, revert, or prerelease, follow
`docs/agents/changelog.md`, update `.agents/skills/dsh-plugin-dev/CHANGELOG.md` and
`CHANGELOG.zh.md`, and run `pnpm skill:changelog:check`. This release train uses independent Skill
SemVer; every published Skill release separately records the DSH version and upstream revision it
verified.

### Pull requests

When creating or updating a PR, use the `visual-pr` skill to write the description: one-sentence "why", `/show-me`-style change outline, saved under `.humanlayer/tasks/` and applied with `gh pr edit --body-file`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/` (extended lazily by the domain skills). Root `CONTEXT.md` is the sole authority for BotHarness product terms such as PersonaBot, Channel, Source Event, Bot Inbox, Orchestrator Session, and Assignment Session; product runtime relationships live under `docs/architecture/`. See `docs/agents/domain.md`.

### UI guidelines

Building or changing in-harness UI follows the `dsh-ui` skill: DSH tokens, `ui-primitives`, the native inset contract, and the measure-the-shell workflow (ADR-0028).

### DSH development

Developing, running, or debugging against a local DSH instance follows the `dsh-dev` skill: dev-loop/profile operations, the `/api` transport contract (api-gateway owns the single interceptor — never `connection.rpc.intercept('/api')`), and the headless debugging playbook. Diagnosed DSH traps must be recorded there in the same change (pitfall log).

For every DSH/Cordis plan, PRD, ADR, or implementation, enter through `dsh-plugin-dev`: read its Context, then its Decision Tree. Use its canonical leading words—Plugin/Fiber/Bundle/Profile/Patch; Service Definition/Provider/Consumer/Capability seam; Registry/Registration/Agent Scope/Service Isolation; Cordis Event dispatch; Agent/AgentHandle/Subagent/Agent Inbox; SessionEvent/`session/event`/Projection/Session Persistence/Session Query; Execution World/Sandbox/Shell/Subprocess/Job/PTY/Schedule/Spill/Storage Domain; Slots/Typert/API Gateway/Conversation Assembly—and label downstream concepts as application-defined. The skill deliberately does not cache version-specific Host/Client/Slots APIs or community patterns; after choosing a seam, verify its concrete mechanism against the current official DSH docs/source and running Host. Do not put BotHarness product vocabulary or architecture into the DSH skill or `/dsh/**`; a design that crosses both layers reads root `CONTEXT.md` for product nouns and the DSH Context for platform nouns.
