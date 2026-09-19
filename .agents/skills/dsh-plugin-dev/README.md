# dsh-plugin-dev

A full-stack authoring guide for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugins — written for coding agents, readable by the people who work with them.

One npm package can carry two halves — a host half (`dsh.bundle`: Cordis plugin, tools, services, events, settings, approvals) and a client half (`dsh.client`: slots, lazy-CJS UI bundle, client↔host RPC). This skill teaches both, plus the packaging and install rules that make them actually show up.

MIT licensed — use it, fork it, ship it.

## Install

```sh
npx skills add BotHarness/dsh-skill
```

Or copy `SKILL.md` and `references/` into your harness's skills directory (e.g. `.agents/skills/dsh-plugin-dev/`).

## What's inside

| File | Covers |
| --- | --- |
| `SKILL.md` | Mental model, extension-point decision table, host & client workflows, top pitfalls |
| `references/host.md` | Package manifest, `cordis.patch.yml` semantics, `defineTool` DSL, events/waterfall, settings, credentials, system prompt, sessions/agents, lifecycle, publish & validate |
| `references/client.md` | `dsh.client` fields, client services/hooks, slots mechanics, generic RPC, the lazy-CJS build contract, failure table, verification checklist |
| `references/slots.md` | Full slot catalog (kind/scope/use) with source declarations |
| `references/community-ui-patterns.md` | Field notes from 13 community plugins: build routes, data channels, proven practices, drift hazards and anti-patterns |

## Provenance

| Field | Value |
| --- | --- |
| `skillVersion` | 0.2.0 |
| `verifiedAgainst` | DSH 0.1.6-alpha.2 |
| `upstreamSha` | `ddefc45fbc7f8e46dd73185e68295696d1297887` (2026-09-17) |
| `verifiedAt` | 2026-09-19 |
| Sources | `docs/research/2026-09-19-dsh-plugin-authoring-host.md`, `…-client.md`, `…-community-plugins-survey.md` in [BotHarness/BotHarness](https://github.com/BotHarness/BotHarness) |

All claims are pinned to the upstream revision above. DSH is in developer preview: breaking changes are expected, and upstream fixes can invalidate specific claims — check the upstream release notes before trusting a mechanism, and re-verification happens here on each DSH release.

## Maintenance

This repository is **generated** from `BotHarness/BotHarness` (`.agents/skills/dsh-plugin-dev/`) by `pnpm sync:skill` — do not hand-edit files here. Issues are welcome: open one here and it gets fixed upstream, where the full research and this skill's history live.
