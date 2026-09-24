---
Status: Accepted
Date: 2026-09-24
---

# Workspace Grants bound PersonaBot file access

ADR-0048 made a Workspace Grant the durable authority for admitting one-cwd Assignments. Human QA then showed that an Orchestrator could use native bash and read to inspect a project file after its Grant was revoked: DSH workspace-write governs writes under one Session cwd and backend temp area but does not isolate reads. A visible list of granted folders therefore cannot truthfully mean file access unless every file-capable operation honors it.

## Decision

The application-defined Workspace Grant is PersonaBot-scoped file authority for the default-safe mode. A valid Grant lets the Orchestrator **read** its resolved project directory. The Orchestrator may directly **write only its Memory Repository**, which remains its fixed cwd and an implicit, non-revocable internal root. To change project files, it creates an independent Assignment with one selected active Grant. That Assignment may read and write that one project directory; it does not inherit the Orchestrator's other Grants or Memory root.

DSH Workspace registration identifies and resolves a directory; it is not authorization. A Human adds an existing Host folder through the DSH picker or an absolute path entry validated by the DSH Workspace registry, then grants it to one PersonaBot. Removing a folder from that Bot's active access list revokes the Grant; it never deletes the host directory, DSH registration, or historical Assignment snapshot. A new Grant does not reactivate a Session bound to an older revoked Grant.

BotHarness must enforce the effective read and write roots at the capability Provider/Execution World seam for **every** filesystem-capable model operation, including native file tools, search, Shell, subprocess-backed tools, and terminal. It must fail closed where a provider cannot enforce the roots. DSH workspace-write remains the native Session mode but is not itself evidence of read isolation or of Memory-only writes; backend temp paths must not bypass the BotHarness boundary. Path identity is canonicalized in the Host execution world. Revocation blocks future capability calls from both roles and future Assignment create/request/resume/wake. In-flight operations need explicit cancellation/settlement before the UI claims that access has ended; already observed content cannot be erased from Session history.

The Human-facing right pane shows Memory as a fixed internal row and active granted folders as removable read-access rows, with an Add folder action. Revoked records remain available as history, not duplicate active rows.

## Scope and trade-offs

This narrows the Human's earlier proposal that the Orchestrator directly read and write every granted folder. Project writes remain attributable to one Assignment and its single Grant. It supersedes ADR-0048's implication that Orchestrator access is confined merely by Memory cwd; ADR-0048's one-Grant-per-Assignment and durable provenance decisions remain.

The existing danger-full-access proposal explicitly bypasses default-safe filesystem confinement. It cannot be presented as Grant-scoped access: any future opt-out requires separate Human confirmation and persistent risk labeling. Orchestrator never inherits that preset. A multi-root writable Orchestrator and a multi-cwd Assignment remain outside this decision.
