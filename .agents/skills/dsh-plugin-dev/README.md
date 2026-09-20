# dsh-plugin-dev

A stable vocabulary and architectural decision skill for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) and Cordis — written for coding agents and the people who collaborate with them.

It establishes the canonical DSH/Cordis Context and a requirement-to-seam Decision Tree. Version-specific API catalogs, Slot inventories, and community implementation surveys are intentionally excluded: verify those details against the current DSH official documentation and source when implementing.

MIT licensed — use it, fork it, ship it.

## Install

```sh
npx skills add BotHarness/dsh-skill
```

Or copy `SKILL.md`, `CHANGELOG.md`, `CHANGELOG.zh.md`, and `references/` into
`.agents/skills/dsh-plugin-dev/`.

## What's inside

| File | Covers |
| --- | --- |
| `SKILL.md` | Foundation-first workflow and the skill's deliberate scope boundary |
| `references/context.md` | Canonical vocabulary, native/application-defined boundaries, and concept maps |
| `references/decision-tree.md` | Requirement-to-seam decisions for dispatch, persistence, execution, and presentation |
| `CHANGELOG.md` / `CHANGELOG.zh.md` | Independent bilingual DSH Skill release history |

`SKILL.md` is the only Agent instruction authority. Each human-readable reference and the release
history have maintained Chinese counterparts. Historical implementation research remains only in
the canonical BotHarness repository under `docs/research/`; it is not mirrored into the installed
skill.

## Provenance

| Field | Value |
| --- | --- |
| `skillVersion` | 0.3.4 |
| `verifiedAgainst` | DSH 0.1.6-alpha.2 |
| `upstreamSha` | `ddefc45fbc7f8e46dd73185e68295696d1297887` (2026-09-17) |
| `verifiedAt` | 2026-09-20 |
| Sources | Pinned DSH evidence under `docs/research/`; DSH/Cordis foundations under `dsh_research/` in [BotHarness/BotHarness](https://github.com/BotHarness/BotHarness) |

DSH is in developer preview. Treat the Context and Decision Tree as stable design guidance, then check the current upstream release before relying on a concrete mechanism.

See the [English](CHANGELOG.md) or [Chinese](CHANGELOG.zh.md) release history. Skill SemVer and the
DSH revision used for verification are separate facts in every published release record.

## Maintenance

The standalone repository is generated from `BotHarness/BotHarness` (`.agents/skills/dsh-plugin-dev/`) by `pnpm sync:skill`; do not hand-edit the mirror.
