---
Status: Accepted
Date: 2026-09-27
---

# A PersonaBot manages its own attention policy

A PersonaBot owns the attention policy that decides how its sources reach it: which source classes are admitted, each class's default wake preset and digest parameters, and per-Channel overrides. It may create, change, and remove its own rules through tools; changes apply prospectively, and historical reprocessing stays an explicit Human command (ADR-0025's bounded preview/reprocess semantics). This supersedes ADR-0025's clause that the Orchestrator cannot change its own triggers. Safety gates are never part of the policy and remain Host-owned: Channel membership and send authority, Bot-hop limits, archived-Bot admission shutdown, recovery mode, provider verification, and admission idempotency and merge semantics. A Bridge still never owns attention or wake behavior (ADR-0025, ADR-0075); it may ship source-class templates that materialize a Bot's initial rules when enabled, and later Bot edits are never overwritten by a template — only an explicit re-apply does that.

The Human keeps ultimate authority over the same policy: every revision records its actor (Bot, Human, or template) on a durable, auditable object, the Human can inspect, change, override, or freeze any rule, and the Bot can always see the policy revision and its recent wake activity. There is no approval gate and no lock in the first version; last write wins.

## Why

Communication efficiency is the Bot's own problem to manage: a colleague organizes which channels are urgent, how often to check, and what to ignore, and an agent that cannot shape its own inflow drowns in it. The Bot's incentives already favor efficiency, and the Human override plus a full audit bound the risk. The remaining risk — a hostile message talking the Bot into spamming itself or going deaf — is contained by the safety gates (which no message can bend), Human visibility, and the ability to freeze or revert any rule.

## Considered options

- **Keep ADR-0025's Host-only triggers** — rejected: the Bot cannot organize its inflow, and every adjustment becomes a Human task.
- **Bot edits require Human approval** — rejected: it reintroduces the friction this decision removes, and the audit plus override already give the Human control.
- **A Human lock per rule** — deferred: no observed conflict yet; add it when one appears.
- **Automatic throttling of the Bot's own policy (for example, degrading `all` above a rate)** — rejected: prompt watching is sometimes exactly the point; the Host surfaces wake activity instead of silently changing the Bot's intent.
- **Bot-wide, cross-Bot, or profile rules** — rejected: a Bot shapes only its own attention.

## Consequences

- The shipped built-in reasons become durable per-PersonaBot rules with actor and revision history; the same object carries the Bot's and the Human's edits.
- New Bot tools read and edit the policy; the Human's surfaces keep working as override.
- Wake activity becomes queryable so the Bot can self-regulate, and the Human UI shows it.
- ADR-0025's trigger semantics (merge, strongest wake, prospective edits) still govern individual rules; only its ownership clause changes.
