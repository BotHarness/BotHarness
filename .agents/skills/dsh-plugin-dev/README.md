# dsh-plugin-dev

A foundation-first design and authoring guide for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) and Cordis plugins — written for coding agents, readable by the people who work with them.

It first establishes the canonical DSH/Cordis vocabulary and a requirement-to-seam decision tree. Implementation details follow only when needed: Host Plugin/Fiber composition, Service/Provider/Consumer capability seams, Session facts and projections, execution/storage boundaries, Typert/API Gateway, and finally browser Slots/build mechanics. Downstream products keep their own domain vocabulary and architecture outside this skill.

MIT licensed — use it, fork it, ship it.

## Install

```sh
npx skills add BotHarness/dsh-skill
```

Or copy `SKILL.md`, `SKILL.zh.md`, and `references/` into your harness's skills directory (e.g. `.agents/skills/dsh-plugin-dev/`).

## What's inside

| File | Covers |
| --- | --- |
| `SKILL.md` | Foundation-first workflow, invariants, branch router, top pitfalls |
| `SKILL.zh.md` | The complete Chinese counterpart, preserving canonical English identifiers |
| `references/context.md` | Canonical Plugin/Fiber, capability, Registry/scope, Event, Session, execution, and Host/client vocabulary |
| `references/decision-tree.md` | Requirement-to-seam decisions for Cordis dispatch, persistence, execution, and UI |
| `references/host.md` | Package manifest, `cordis.patch.yml` semantics, `defineTool` DSL, events/waterfall, settings, credentials, system prompt, sessions/agents, lifecycle, publish & validate |
| `references/client.md` | `dsh.client` fields, client services/hooks, Typert/API Gateway, Slots mechanics, lazy-CJS build contract, failure table, verification checklist |
| `references/slots.md` | Full slot catalog (kind/scope/use) with source declarations |
| `references/community-ui-patterns.md` | Field notes from 13 community plugins: build routes, data channels, proven practices, drift hazards and anti-patterns |

Every file under `references/` has a maintained `.zh.md` counterpart for Chinese readers. Code identifiers, event names, and canonical leading words remain unchanged across languages.

## Provenance

| Field | Value |
| --- | --- |
| `skillVersion` | 0.3.2 |
| `verifiedAgainst` | DSH 0.1.6-alpha.2 |
| `upstreamSha` | `ddefc45fbc7f8e46dd73185e68295696d1297887` (2026-09-17) |
| `verifiedAt` | 2026-09-20 |
| Sources | Pinned DSH authoring evidence under `docs/research/`; DSH/Cordis foundations under `dsh_research/` in [BotHarness/BotHarness](https://github.com/BotHarness/BotHarness) |

DSH-native claims are pinned to the upstream revision above. DSH is in developer preview: breaking changes are expected, and upstream fixes can invalidate specific claims — check the upstream release notes before trusting a mechanism, and re-verification happens here on each DSH release.

## Maintenance

This repository is **generated** from `BotHarness/BotHarness` (`.agents/skills/dsh-plugin-dev/`) by `pnpm sync:skill` — do not hand-edit files here. Issues are welcome: open one here and it gets fixed upstream, where the full research and this skill's history live.
