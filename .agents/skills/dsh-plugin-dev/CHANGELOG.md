# DSH Skill Changelog

Notable changes to the installable DSH/Cordis Context and Decision Tree are recorded here. Skill
SemVer identifies this artifact; the DSH version and upstream revision record what its claims were
verified against.

## [Unreleased]

Preparing the next DSH Skill release independently from downstream product releases.

### Documentation

- Recorded directory picker capability differences and native selection fallback in the [local development guide](../dsh-dev/SKILL.md), verified against pinned DSH 0.2.0 RC1 with a real Inbox Grant flow ([#552](https://github.com/BotHarness/BotHarness/issues/552)).

- Recorded isolated Provider activation order, native Consumer Policy capture and the actual Tool execution boundary in the [local development guide](../dsh-dev/SKILL.md), verified with pinned DSH 0.2.0 RC1 native file and approved Shell calls ([#632](https://github.com/BotHarness/BotHarness/issues/632)).

- Clarified native token projection totals and dispatch-route attribution for failed attempts in the [local development guide](../dsh-dev/SKILL.md), verified against DSH 0.2.0 RC1 with real Assignment and Subagent calls ([#503](https://github.com/BotHarness/BotHarness/issues/503)).

- Documented optional Bundle preservation when restarting an isolated development Profile ([#117](https://github.com/BotHarness/BotHarness/issues/117)).
- Recorded optional provider token buckets and actual Assistant source-route attribution in the [local development guide](../dsh-dev/SKILL.md), preventing missing reports from being treated as zero or estimated consumption ([#499](https://github.com/BotHarness/BotHarness/issues/499)).
- Recorded the distinction between an application-reserved Session ID and a persisted DSH Session in the [local development guide](../dsh-dev/SKILL.md), so pre-execution refusals can be retried after repair ([#500](https://github.com/BotHarness/BotHarness/issues/500)).

- Established an independent bilingual Release Ledger for the DSH Skill ([#102](https://github.com/BotHarness/BotHarness/issues/102)).

## [0.3.4] - 2026-09-20

Focused the installable skill on stable DSH/Cordis language and architectural decisions.

- **Skill version:** `0.3.4`
- **Verified against DSH:** `dsh 0.1.6-alpha.2`
- **Upstream revision:** [`ddefc45fbc7f8e46dd73185e68295696d1297887`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)

### Changed

- Refocused the Context and Decision Tree on stable DSH/Cordis seams while leaving version-specific APIs to current upstream documentation and source ([#26](https://github.com/BotHarness/BotHarness/issues/26)).
