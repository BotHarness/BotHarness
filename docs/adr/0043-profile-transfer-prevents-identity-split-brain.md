---
Status: Accepted
Date: 2026-09-20
---

# Profile Transfer prevents identity split brain across Hosts

Identity-preserving recovery has two modes. A planned **Profile Transfer** quiesces the source profile, closes its provider ingress and external-action gates, creates a Profile Backup bound to a unique **Transfer Generation**, and durably marks the source **Transferred Out**. The target validates that generation during staged Managed Restore and becomes the active holder only after activation. The source cannot run PersonaBots, receive provider events, or execute external actions merely by restarting; a normal unarchive or credential reappearance does not clear Transferred Out.

A **Disaster Restore** is allowed when the source cannot prove deactivation, but it makes the uncertainty explicit. The restored profile's provider bindings, provider-bound Inbox Triggers, and Service Grants remain suspended, no prior Session auto-resumes, and no Outbox work restarts. The Human must acknowledge possible split brain and complete the later rebind/reactivation protocol before external side effects become possible. This preserves offline disaster recovery without pretending the missing device has stopped.

Provider reactivation never trusts a copied credential reference or account label. The Human first binds a target-local credential; the authenticated adapter then derives a non-secret **Provider Account Fingerprint** from stable provider-issued tenant or organization, application or bot, and account identifiers. Only an exact fingerprint match plus one explicit Human confirmation may reactivate the suspended binding, provider-bound Triggers, and the previously declared Service Grant scopes. Disaster Restore also requires the Human to acknowledge the unresolved split-brain risk in that confirmation. A missing or mismatched fingerprint remains disabled and requires a new authorization flow; it never inherits old authority by similarity.

Before the target activates a Transfer Generation, the source may cancel the transfer, durably invalidate that generation, and reopen its own gates. Once the target activates, cancellation is no longer a rollback: the source remains Transferred Out. Moving the identity back requires a new reverse Profile Transfer from the active target. If the active target is lost, the old source may perform Disaster Restore/reclaim only through the same split-brain acknowledgement and suspended-provider posture as any other disaster recovery.

Profile Transfer is not synchronization. After target activation, source and target do not form peers and no operational rows merge in either direction. A later move creates another Transfer Generation from the currently active profile.

## Considered Options

- **Activate every restored profile immediately** — rejected: the old and new installations could both answer the same provider events under the same PersonaBot identity.
- **Require the source to be online for every restore** — rejected: a lost or destroyed device would make disaster recovery impossible.
- **Treat credentials being absent as sufficient split-brain protection** — rejected: credentials may still exist on the source, may be restored separately on the target, and are not the identity lease.
- **Synchronize both profiles after restore** — rejected: BotHarness has no multi-primary ordering, conflict, or external-side-effect protocol.
- **Rebind provider authority by credential reference, account label, or partial identity match** — rejected: those values are local, mutable, or ambiguous and cannot prove the same provider principal.
- **Roll back to the source after target activation by clearing Transferred Out** — rejected: the target may already have admitted events or emitted effects. The active target must initiate a new reverse transfer, or the source must use the stricter Disaster Restore path if the target is lost.

## Consequences

- Planned migration has one active generation and leaves an enforceable Transferred-out source tombstone.
- Disaster Restore is possible offline but starts with every provider-bound execution path suspended.
- The transfer/restore manifest records source installation id, Transfer Generation, cutoff, target activation evidence, and whether source deactivation was proven.
- In-flight-at-cutoff external requests follow ADR-0039's Unknown Outcome path and are never retried simply because a target became active.
- Rebinding uses an adapter-derived Provider Account Fingerprint, exact matching, and explicit Human confirmation; credential references and display names are never identity evidence.
- A source can cancel only before target activation. After activation it remains Transferred Out; return uses a new reverse transfer, while loss of the active target uses suspended Disaster Restore/reclaim.
