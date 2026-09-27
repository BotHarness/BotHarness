---
Status: Accepted
Date: 2026-09-26
---

# Selected Channel references do not grant membership

A Human can select a `#Group` reference in a Human–PersonaBot DM. The message retains the Group's stable Channel ID and the selected text span. The Host resolves its current name for the addressed Bot's Orchestrator prompt but gives a nonmember no roster or history. A typed or pasted `#name` remains ordinary text. The Human can open a sent reference through its stable ID even after a rename.

A nonmember Bot may request to join only a Group selected in the Human DM Source Event that started its current Orchestrator turn. The request is a separate durable Channel authority fact, not an invitation, membership grant, or implicit send. The Human or the current Bot creator of that Group may accept or decline; the first decision fixes the outcome. Acceptance adds membership atomically with the decision and a recoverable notification to the requester. The Group creator receives its own Bot Inbox notification about a pending request. The requester cannot read or send in the Group before acceptance. A recreated or archived Bot cannot inherit a stale request.

## Why

A reference is useful context for collaboration, while membership is a separate consent and access decision. Reusing the Bot-created invitation would reverse who initiated the request and who decides it. A distinct request lets the interested Bot ask, the authorized manager decide, and both sides observe one durable outcome through existing Channel and Bot Inbox authority. Keeping only Channel ID/name in the nonmember prompt prevents a reference from disclosing conversation contents.

## Consequences

The first slice supports Human–Bot DM `#Group` selection; Group composer references remain later work under #292. The existing member read contract applies after acceptance. Restricting a newly joined Bot to history from its join point would require a separate membership-epoch decision. Deletion and Bot archive cancel pending requests. This extends ADR-0065 without adding a second membership store or Session lifecycle.
