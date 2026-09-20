---
Status: Accepted
Date: 2026-09-20
---

# Restore revalidates target runtime dependencies

Managed Restore separates durable data recovery from target-local runtime readiness. A valid Profile Backup restores and activates its selected data facets even when the target Host lacks an adapter, model, plugin, tool, Skill, credential, or Workspace directory needed to execute some behavior. Historical facts remain readable. Missing environmental dependencies produce stable fail-closed readiness reasons; they do not turn an otherwise valid backup into a corrupt or partial restore.

The backup carries a non-secret **Runtime Dependency Manifest** assembled from declarations owned by the relevant deep modules and bot configuration. Each declaration identifies a stable **Dependency Contract** and whether it is required or optional for a named capability scope. The contract compares supported interface and persisted-schema version ranges, so a compatible target implementation need not have the producer's exact package version. The producer version and integrity identifier remain diagnostic evidence; an unsupported range reports `dependency-incompatible` and stays gated. The manifest never embeds executable plugin or Skill code and never infers current requirements from historical tool calls. The target resolves dependencies through its trusted installation and configuration paths; Managed Restore is not a software installer.

Deep modules own the non-downgradable technical, authority, and data-integrity requirements behind their interfaces. PersonaBot or plugin configuration may request optional capabilities, and a Human may disable those optional features, but an imported package cannot relabel a Host-owned required dependency as optional. This keeps trust classification outside exporter-controlled data.

A missing provider adapter marks its Binding, provider-bound Inbox Triggers, Service Grants, and Service Actions `dependency-missing` and suspended. Source Events, audit facts, and provider descriptors remain readable. Installing a compatible adapter removes only the dependency failure; ADR-0043's credential binding, Provider Account Fingerprint match, and Human confirmation still govern authority reactivation.

Portable intent and local satisfaction are separate. A **Desired Dependency Reference** preserves the originally requested model, provider capability, plugin capability, Skill, tool, or Workspace identity and its provenance. A **Target Resolution** records how the current Host satisfies that intent. Human remapping changes the Target Resolution without overwriting portable intent; a later backup may retain the local value as a diagnostic hint, but another Host must resolve it again.

Workspace content is external to Profile Backup. Each restored Workspace Desired Dependency Reference retains its source canonical path, logical label, and available identity hints such as a repository remote fingerprint, but begins as an **Unavailable Workspace Reference** on a different target environment. The UI may suggest a matching existing directory, yet a Human must explicitly map and verify it, choose a different directory, explicitly create a new one, or leave it unavailable. BotHarness never trusts or creates the same absolute path automatically. A Work Session cannot resume until its Workspace is mapped and its other runtime requirements pass.

Model and model-provider selections restore as desired configuration, not as permission to substitute. The target must resolve the declared model, provider, and local credential before starting the dependent Orchestrator or Work Session. Failure reports `model-unavailable` and offers explicit Human remapping; it never silently falls back to the target's default model because that could change behavior, tool access, privacy, and cost.

One target-local **Activation Readiness** projection evaluates these declarations through deep-module query interfaces. Gating is capability-scoped: an optional missing dependency or an unavailable non-core integration makes the PersonaBot `degraded`; the affected Binding, Trigger, Service Action, or Work Session remains unavailable while unrelated capabilities may run. The PersonaBot is `blocked` only when a required core execution dependency, such as its Orchestrator model, is unavailable. Readiness is derived target state, not another persisted execution lifecycle and not a replacement for PersonaBot activity.

Profile data activation never starts execution. After restore every PersonaBot remains cold until a Human reviews the readiness and reauthorization checklist and issues **PersonaBot Activation**. That command creates a fresh Orchestrator Session rather than resuming the source Orchestrator, and opens only the execution, ingress, wake, and external-action paths whose dependencies and authorities currently pass. Merely installing a plugin or making readiness `ready` never activates a PersonaBot.

Readiness also reacts to runtime drift. When an installed dependency disappears or becomes incompatible, the owning modules atomically gate new dependent execution and external actions and report the affected Session or capability blocked. An already issued model or provider request is not assumed cancelled and must settle through the existing Session or Outbox outcome rules. When compatibility returns, readiness recomputes, but stopped or blocked execution never resumes automatically and authority checks are not bypassed.

## Considered Options

- **Abort the whole restore when a provider adapter or other runtime dependency is absent** — rejected: environment availability is not package corruption, and blocking recovery would also hide unaffected Soul, Memory, and history.
- **Install missing plugins or Skills automatically from the backup** — rejected: Profile Backup must not become an unreviewed code-distribution or supply-chain mechanism.
- **Embed executable plugin and Skill bundles for exact environment reproduction** — rejected: executable code has separate trust, provenance, operating-system, architecture, and DSH compatibility constraints.
- **Trust or recreate a source absolute Workspace path automatically** — rejected: the same path can name unrelated content on another Host, and an absent path does not imply permission to create an empty workspace.
- **Silently fall back to the target's default model** — rejected: model choice changes behavior, capability, privacy, and cost and therefore requires explicit Human remapping.
- **Block the entire PersonaBot whenever any required integration is unavailable** — rejected: a dependency should gate the smallest capability scope that actually requires it. Only missing core execution dependencies block the whole PersonaBot.
- **Infer dependency requirements from prior Session tool usage** — rejected: historical use is evidence, not a declaration of what current behavior requires.
- **Require the producer's exact plugin build** — rejected: exact locks prevent compatible security fixes and cross-platform implementations. Stable interface/schema contracts define compatibility instead.
- **Let an imported package downgrade Host-owned requirements to optional** — rejected: exporter-controlled data cannot weaken authority or integrity constraints.
- **Overwrite portable intent whenever the Human remaps a target dependency** — rejected: Host-local paths and aliases would erase provenance and leak machine-specific configuration into the next migration.
- **Start the Orchestrator automatically when dependencies become ready** — rejected: data restore, dependency resolution, authority restoration, and execution activation are distinct Human-visible transitions.
- **Check dependencies only at startup** — rejected: uninstall, credential removal, or incompatible upgrade could leave active paths operating under invalid assumptions.

## Consequences

- Successful data restore and runtime readiness are separate, visible outcomes.
- Missing dependencies produce `dependency-missing`, `workspace-unavailable`, or `model-unavailable` at the affected capability rather than a generic restore failure.
- Provider history is usable without the provider adapter, but ingress, wakes, replies, and Service Actions stay suspended until both dependency and ADR-0043 authority checks pass.
- Workspace mappings are Human-confirmed target-local configuration. Restored source paths are evidence and suggestions, never authority.
- Desired model configuration is preserved exactly until the Human explicitly remaps it.
- Required and optional dependency declarations drive one capability-scoped `ready | degraded | blocked` projection; they do not create another Session or PersonaBot lifecycle.
- Profile Backup contains a dependency manifest and data, not executable plugin or Skill code.
- Compatibility follows Host-owned Dependency Contracts rather than exact package versions; incompatible ranges remain gated.
- Desired Dependency References remain portable while Target Resolutions are Host-local and must be resolved again on another Host.
- Every restored PersonaBot is cold until explicit PersonaBot Activation creates a fresh Orchestrator Session and opens only ready, authorized paths.
- Runtime dependency drift gates new affected work immediately. In-flight outcomes remain governed by existing protocols, and dependency recovery never auto-resumes execution.
