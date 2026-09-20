# DSH and Cordis Plugin Development

Reliable DSH plugin design starts before Host or Client code: name the runtime objects precisely, then choose the seam that matches the requirement. This section is a foundation-first guide—written as an installable agent skill and rendered here for people. Host, Client and Slots remain available as implementation branches after the shared Context and Decision Tree.

## Install the skill

```sh
npx skills add BotHarness/dsh-skill
```

[`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) is the install source. It mirrors the skill folder in [`BotHarness/BotHarness`](https://github.com/BotHarness/BotHarness) — which stays canonical — and is refreshed whenever DSH releases. Prefer to wire it up yourself? Copy `SKILL.md` and `references/` into `.agents/skills/dsh-plugin-dev/`.

## What's inside

| Page                                   | Covers                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Canonical context](/dsh/context)      | DSH and Cordis leading words; native and application-defined boundaries                   |
| [Decision tree](/dsh/decision-tree)    | Choose Service, Event, Registry, SessionEvent, Projection, storage, execution or UI seams |
| [The full guide](/dsh/guide)           | Foundation-first workflow, implementation branches and top pitfalls                       |
| [Host-side reference](/dsh/host)       | Package manifest, `cordis.patch.yml`, tools, events, settings, credentials, lifecycle     |
| [Client-side reference](/dsh/client)   | `dsh.client`, client services and hooks, Typert/API Gateway, lazy-CJS build contract      |
| [Slot catalog](/dsh/slots)             | Every UI slot with its kind, scope and use                                                |
| [Community UI patterns](/dsh/patterns) | How 13 community plugins build UI—build routes, proven practices, drift hazards           |

## Product documentation is separate

This section names and explains DSH/Cordis development concepts only. BotHarness owns its product language and architecture under `/dev`: use the [BotHarness domain glossary](/dev/spec/context) for definitions, then the [focused runtime architecture](/dev/architecture/bot-runtime) for product relationships on DSH.

## Honest boundaries

Everything here is distilled from the upstream DSH source and docs at one pinned revision, plus verified community reports. DSH is in developer preview: mechanisms move, and an upstream fix can invalidate a specific claim. Every page therefore carries a provenance bar — skill version, the DSH version and commit it was verified against, and the date — and the same values travel inside the downloaded skill. The full research notes live in the repository at `docs/research/`.
