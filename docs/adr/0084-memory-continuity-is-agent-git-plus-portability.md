---
Status: Accepted
Date: 2026-09-28
---

# Memory continuity is agent-mediated Git plus Portability

One owner's Memory follows them across their own devices through the Orchestrator's ordinary Git capability on request, through creating a new PersonaBot from the Memory remote (#298), and, for owners who do not operate Git, through PersonaBot Export / Profile Backup and Restore. BotHarness adds no first-party sync Skill, no Host-owned remote or credentials, and no Client sync surface in v1. Device B holds the same Memory content under a different PersonaBot identity.

## Why

The capability already exists: the Orchestrator's working directory is the Memory Repository, and the Agent holds native file, Shell, and Git access (ADR-0068), so pushing or pulling to a remote the owner configured is an ordinary agent-mediated Git operation. The pull direction ships as create-from-Git-URL (#298), which already reuses the Host's Git credential helper or SSH agent. A first-party `memory-sync` Skill would add guardrails, a trigger token, and prose — not a capability — while a GUI trigger cannot remove the real obstacle for non-Git owners: a private remote plus bring-your-own login. One-click or Host-owned synchronization requires the Host to hold provider credentials, which the credential boundary (ADR-0006) and the single-user local model leave to a separate architecture decision. The Channel sidebar Memory panel plus unified memory-change delivery (#350–#353) remains the Human oversight surface.

## Considered options

- **First-party `memory-sync` Skill plus user guide (#187–#192)** — rejected: packaging, not capability, and its premises no longer hold after ADR-0068 superseded the admitted-commit gate.
- **Host-owned sync service holding the token in DSH credentials** — rejected for v1: it creates a second authority beside the Git repository and puts a secret behind agent shell operations; reopening it needs its own ADR.
- **GUI sync binding with OAuth** — rejected: the product has no account system, and OAuth cannot create the private remote an owner does not have.
- **Guiding non-Git owners through manual Git setup** — rejected: the setup effort, not the trigger, is what blocks them; Portability is the credential-free path.

## Consequences

- Git-literate owners simply ask their bot; no product work is required. A short backup/move guide may ride Portability when it ships.
- Non-Git-literate owners wait for PersonaBot Export / Profile Backup instead of a sync feature that still demands a remote, a login, and a conflict story.
- Whether the Orchestrator's Execution World shell inherits `HOME`, the SSH agent, and Git credential helpers remains unverified; a failure there does not change this decision but strengthens the future Host-owned case.
- Decision record: #398. Reopening one-click synchronization requires an ADR that supersedes this one.
