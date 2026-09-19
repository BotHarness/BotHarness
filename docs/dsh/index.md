# DSH Plugin Development

A DeepSeek Harness plugin has two halves: a **host half** that registers tools, services, events and settings, and a **client half** that draws UI into the official slots over RPC. This section is the full-stack authoring guide — written as an agent skill you can install, rendered here for people.

## Install the skill

```sh
npx skills add BotHarness/dsh-skill
```

[`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) is the install source. It mirrors the skill folder in [`BotHarness/BotHarness`](https://github.com/BotHarness/BotHarness) — which stays canonical — and is refreshed whenever DSH releases. Prefer to wire it up yourself? Copy `SKILL.md` and `references/` into `.agents/skills/dsh-plugin-dev/`.

## What's inside

| Page                                   | Covers                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| [The full guide](/dsh/guide)           | Mental model, extension-point decision table, host and client workflows, top pitfalls |
| [Host-side reference](/dsh/host)       | Package manifest, `cordis.patch.yml`, tools, events, settings, credentials, lifecycle |
| [Client-side reference](/dsh/client)   | `dsh.client`, client services and hooks, generic RPC, the lazy-CJS build contract     |
| [Slot catalog](/dsh/slots)             | Every UI slot with its kind, scope and use                                            |
| [Community UI patterns](/dsh/patterns) | How 13 community plugins build UI — build routes, proven practices, drift hazards     |

## Honest boundaries

Everything here is distilled from the upstream DSH source and docs at one pinned revision, plus verified community reports. DSH is in developer preview: mechanisms move, and an upstream fix can invalidate a specific claim. Every page therefore carries a provenance bar — skill version, the DSH version and commit it was verified against, and the date — and the same values travel inside the downloaded skill. The full research notes live in the repository at `docs/research/`.
