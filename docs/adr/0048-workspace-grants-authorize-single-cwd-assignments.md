---
Status: Accepted
Date: 2026-09-21
---

# Workspace Grants authorize single-cwd Assignments

ADR-0063 supersedes this decision's implied Orchestrator file-access boundary. The one-cwd Assignment and durable Grant provenance rules remain in force.

A PersonaBot needs durable authority to reuse project directories without asking the Human again for every Assignment, while its Orchestrator must retain one stable home for Memory and coordination. BotHarness therefore defines **Workspace Grant** as an application-defined, PersonaBot-scoped authorization and keeps it separate from the DSH-native Workspace that identifies and attaches a directory to a Session.

## Decision

A Workspace Grant is a durable, revocable BotHarness fact stored with operational authority in `botharness.db`. It references one exact, Host-resolved Workspace and permits one PersonaBot to create or resume Assignment Sessions there until the Human revokes it or the target mapping becomes invalid. One approval is reusable across Assignments; the Orchestrator may read and enforce the grant but may not create, broaden, or restore it on its own.

The grant is not a DSH Workspace, Workspace Registration, Agent Scope rule, Service Grant, or `cwd` inference. DSH remains authoritative for Workspace identity and Session attachment; BotHarness is authoritative for whether this PersonaBot may use that resolved target. Assignment creation and idle resume fail closed when the grant is absent, revoked, unresolved, or no longer matches the Session's recorded Workspace. Revocation blocks future admission to that Workspace but does not rewrite historical Session facts or silently transfer a running Session; stop/cancel policy remains a separate explicit operation.

V1 gives each Assignment Session exactly one `cwd`, derived from exactly one valid Workspace Grant. The Orchestrator Session never adopts a project Workspace: its `cwd` is fixed to the PersonaBot's Memory Repository. A PersonaBot works across projects by creating or reusing multiple Assignment Sessions, each with its own single Workspace and `cwd`. A Composite Execution World or multi-root Assignment is deferred until a real cross-project workload justifies a separately verified DSH Provider seam.

Workspace Grants are target-local operational authority, not Soul content. Backup may retain their declarations and provenance, but restore cannot reactivate them until the target Workspace is resolved and the Human confirms the mapping under the current Host.

## Considered Options

- **Ask for permission for every Assignment** — rejected: repeated approval adds friction without changing the PersonaBot/Workspace boundary once the Human has granted it.
- **Move the Orchestrator `cwd` to the current project** — rejected: it makes the control plane's filesystem context unstable and disconnects ordinary file access from the PersonaBot's Memory Repository.
- **Let one Assignment span several directories** — rejected for v1: DSH Sessions have one working directory, and a composite view would require its own Execution World, path, authorization, and cancellation contract.
- **Treat DSH Workspace existence as authorization** — rejected: availability is not PersonaBot-specific Human authority.
- **Infer permission from an earlier Session `cwd`** — rejected: historical execution location is not a revocable authorization record.

## Consequences

- The Assignment Directory projects one Workspace and current grant readiness for each Assignment Session; it never infers authority from `cwd` alone.
- Assignment create/resume commands validate Workspace Grant and DSH Workspace resolution before crossing into Agent creation or delivery.
- The Memory Repository and project Workspaces remain different directory roles even when both are ordinary Git repositories.
- Cross-project work is visible as several Assignment Sessions coordinated by one Orchestrator, not as hidden directory switching inside one Session.
