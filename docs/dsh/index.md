# DSH and Cordis Context

Reliable DSH plugin design starts with precise language and stable architectural boundaries. This section is the human-readable form of the installable `dsh-plugin-dev` skill: use the Context to name the platform correctly, then use the Decision Tree to choose one primary seam for each responsibility.

## Install the skill

```sh
npx skills add BotHarness/dsh-skill
```

[`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) mirrors the canonical skill folder in [`BotHarness/BotHarness`](https://github.com/BotHarness/BotHarness). You can also copy `SKILL.md`, `SKILL.zh.md`, and `references/` into `.agents/skills/dsh-plugin-dev/`.

## Stable foundation

| Page                                | Covers                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| [Canonical context](/dsh/context)   | DSH/Cordis leading words, native boundaries, and concept maps                                |
| [Decision tree](/dsh/decision-tree) | Choosing Service, Event, Registry, SessionEvent, Projection, persistence, or execution seams |

The skill intentionally excludes Host and Client API catalogs, Slot inventories, and community implementation patterns. Those details change quickly: after the Decision Tree selects a seam, verify its concrete mechanism against the current [DSH official documentation](https://deepseek-harness.github.io/deepseek-harness/), pinned source, and running Host.

Historical investigations remain in the canonical repository under `docs/research/`. They are evidence for maintainers, not published Skill guidance.

## Product documentation is separate

This section names DSH/Cordis concepts only. BotHarness owns its product language and architecture under `/dev`: use the [BotHarness domain glossary](/dev/design/context) for product definitions and the [runtime architecture](/dev/design/bot-runtime) for product relationships on DSH.

## Provenance

Every page carries the Skill version, the DSH revision it was checked against, and the verification date. DSH is in developer preview; provenance makes the evidence inspectable, but it does not turn a concrete API detail into a permanent contract.
