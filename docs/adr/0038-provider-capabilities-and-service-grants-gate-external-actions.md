---
Status: Accepted
Date: 2026-09-20
---

# Provider Capabilities and Service Grants gate external actions

Every configured external-provider account advertises an explicit Provider Capability set through its adapter, such as new-message receive, recall events, current-message fetch, replies, attachments, threads, or proactive posting. BotHarness exposes an Inbox Trigger, reconciliation path, reply, or Service Action only when that exact capability is available; plugin installation, a source target appearing in model context, and tool visibility never imply capability or authorization.

A normal Reply is authorized by the trusted Reply Route already attached to its Source Event and automatically selects the provider and destination. A proactive Service Action — for example, choosing a Feishu channel or thread and publishing without an inbound message — additionally requires a Human-issued Service Grant scoped to one provider account, named actions, and a bounded target set. Actions inside the grant run without per-message approval; an unknown target, broader action, missing capability, revoked grant, or higher-risk provider operation fails closed or enters the explicit approval path. The provider service re-authorizes the target at execution time even if the model learned it from a Source Event.

Target scope uses provider-resolved opaque stable references rather than display names. A Grant may name exact targets, a Human-maintained target group, or a wildcard selector. For a casual connection flow, wildcard may be the default proposed target scope and need not expire, provided the Human completes an authorization surface that clearly names the provider account and selected actions. The grant never expands automatically when a plugin later adds actions; the Human may narrow targets or revoke it at any time. The provider resolves and authorizes the concrete target at execution, so a rename, deletion, or provider-scope change cannot be hidden behind the wildcard.

The Host validates the current Service Grant both when it accepts an outbox intent and immediately before the provider side effect. Revocation marks every not-yet-started affected intent `grant-revoked` and prevents retries; it never deletes the audit record. A provider request already in flight cannot be retroactively unsent, so its eventual success, failure, or unknown outcome remains recorded under the grant snapshot that authorized its start.

## Considered Options

- **Lowest common denominator across providers** — rejected: richer providers would lose useful recall, fetch, thread, attachment, and proactive-send behavior.
- **Optimistically call unsupported operations** — rejected: runtime errors are not a capability contract and cannot safely shape tools, triggers, or UI.
- **Approval for every proactive post** — rejected: repetitive approval makes explicitly granted recurring work unusable.
- **Plugin installation grants every action and target** — rejected: software availability is not Human authorization and would create an account-wide confused-deputy boundary.
- **Use target display names as authority** — rejected: names change, collide, and do not establish provider identity.
- **Plugin installation silently grants an account-wide wildcard** — rejected: casual defaults are acceptable only inside an explicit account/action authorization flow.
- **Mandatory wildcard expiry and renewal** — rejected: it adds recurring consent complexity to ordinary personal automation without changing the account/action boundary or the Human's ability to revoke.
- **Check the Grant only when queueing** — rejected: delayed work could execute after Human revocation.
- **Check the Grant only at execution** — rejected: unauthorized intent would enter the durable outbox and appear accepted before later failure.

## Consequences

- Capability is resolved per configured provider account, because scopes and enabled features may differ between two accounts using the same adapter.
- Service Grants are durable Host policy in the Messaging store, not PersonaBot Soul/Memory and not model-editable. Revocation and archive gates affect subsequent executions immediately.
- Exported Grant declarations and provider account references are inactive Rebinding Requests: imports never receive credentials, active grants, or automatic provider access.
- Outbox intents retain the Grant id/version accepted at enqueue while execution also validates the current Grant, making revocation races observable and deterministic.
- Target discovery and target authorization remain separate: Source Event context may reveal an opaque target reference, but only the provider service can resolve and authorize it for an action.
- Exact refs, configured groups, and explicit wildcards share the same execution-time authorization path; the model cannot convert one into another.
- Wildcard is a normal durable target scope after Human authorization; it carries no mandatory expiry, but remains inspectable, narrowable, and revocable.
- Unsupported, permission-missing, target-out-of-scope, and grant-revoked errors are stable, observable outcomes rather than silent fallback.
