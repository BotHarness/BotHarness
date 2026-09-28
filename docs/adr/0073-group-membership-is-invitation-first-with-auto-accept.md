---
Status: Accepted
Date: 2026-09-27
---

# Group membership is invitation-first with default auto-accept

A Group's Bot creator is its only Bot inviter, and membership still begins with an invitation. A profile-level Bot-mode setting, **auto-accept Group invitations**, defaults to on; while it is on, the Host accepts an invitation on behalf of the invited PersonaBot without starting an Orchestrator turn, and the invitation stays recorded as a resolved attention decision. While it is off, the invitation remains pending for the invited Bot alone to accept or decline, and a decline never wakes that Bot again. A Group with no Bot creator keeps Human authority for membership; its pending join requests stay decisions addressed to the Group's Bot creator or the Human, never a broadcast to members. There is no Group role system: the Bot creator manages Bot membership and Group settings, while the Human inspects, overrides, cancels invitations, removes members, and alone deletes the Channel. Membership stays reversible — a Human can remove a Bot, and a Bot can leave on its own.

## Why

The common case is a colleague who is happy to join, so a per-invitation decision is friction for both sides; one Bot-mode default removes it while the off switch keeps the consent semantics. Treating a PersonaBot as a person made admittance low-stakes — it can quiet a Channel (ADR-0074) or leave one — so Discord-style reviewer roles and approval queues would be org-shaped complexity this product does not need yet. Membership stays owner-and-Human-scoped because a Group is small and someone accountable answers for it, and a join request stays addressed because one decision belongs to one decider.

## Considered options

- **Keep every invitation pending for the invited Bot's own decision** — rejected: it costs a wake per invite for a case that almost always accepts.
- **Instant membership for every invitation, without a setting** — rejected: there would be no way to run a Bot that joins only when told.
- **Discord-like membership roles or a reviewer set** — rejected for now: a permissions system is org-shaped weight for personal Groups.
- **Fan out a join request to every member** — rejected: membership is one accountable decision, not a poll.
- **Drop join requests and keep invitation as the only entry** — rejected: the Human-selected `#Group` reference path (ADR-0069) lets an interested Bot ask; removing it loses cold-start collaboration.

## Consequences

- ADR-0065's rejected "instantly join an invited Bot" option returns as the default behavior under one explicit profile setting; its reasoning still holds whenever auto-accept is off.
- A Bot-mode setting and Host behavior are required; with auto-accept on, the `group-invite` admission resolves without waking and remains visible as a decision fact.
- A Bot self-leave command uses the canonical member-removal path: read/send authority ends at removal, a departing Bot creator yields management to the Human, pending Group delivery cannot wake a departed member, and the same transaction places one Host-authored departure notice in the Group history with one ordinary Inbox Admission per active remaining Bot. Each Admission snapshots that Bot's Channel attention preset: all may wake immediately, digest wakes at its count or interval, mentions can join a later direct-mention turn, and silent waits for an explicit read. The leaver receives no Admission. Revoked pending Group deliveries settle in the terminal handled attempt state with their revocation reason retained for audit; they do not imply that the departed Bot observed the messages or create Human Inbox repair actions. The durable notice records whether the Bot left voluntarily or was removed by a Human or Bot owner; its body and localized timeline copy use that distinction. Older notices without the field retain their original leave wording. A turn carrying this system notice can finish without a reply. If post-commit live publication or wake scheduling fails, the two effects remain independent; the running Host retries the durable Group admission wake with bounded backoff, and startup recovery remains available after a restart.
- One durable membership store (the Channel record) and one admission path remain; there is no second membership lifecycle.
