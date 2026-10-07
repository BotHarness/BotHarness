---
Status: Proposed
Date: 2026-10-07
---

# A bound app admits its direct messages and mentions

A person who binds a Bot to a Lark, Discord, Slack or WeChat app expects that Bot to receive and answer messages sent to that app. Today the same result needs four separate authorities: connect the app in the Provider's IM settings, save a delivery target for every conversation, bind the Bot's external identity, authorize each saved target and then switch its reception on. A conversation without a saved target and an explicit Grant is acknowledged and discarded, so a DM or @mention to a freshly bound app reaches nothing. The Provider settings list also does not show which Bot uses an app, and a Bot can bind only one app per platform. This ADR proposes one binding step. The platform's own controls decide who can reach the app. The binding decides which Bot answers. Conversations become a list the person manages after the fact.

This amends [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md) (one account per platform per Bot), [ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md) (reception requires a granted saved destination), [ADR-0111](0111-external-identity-lifecycle-is-independent-of-grants.md) (account-only binding creates no reception, the unique Bot/platform constraint stays in force) and [ADR-0120](0120-multiple-bridge-routes-retain-canonical-sources.md) (binding an identity alone creates no route). It also amends [ADR-0038](0038-provider-capabilities-and-service-grants-gate-external-actions.md): a proactive post to a conversation with an active entry no longer needs a Provider-saved target. Saved-target Service Grants remain for conversations the Bot has never seen.

## Decision

**The gate moves from the conversation to the app.** An enabled external identity Binding is the authority to receive that app's _default traffic_ into the bound Bot's Inbox. Default traffic is a direct message to the app, plus a message in a group the app belongs to that the qualified Provider reports as mentioning the receiving account (`mentionedAccount`). Whether someone can DM the app, add it to a group or mention it is decided on the platform: the app's availability scope, workspace or guild membership, group administration and the scopes and events the app was granted. BotHarness does not add a second per-conversation consent before admission. Ordinary group text, followed threads, Channel placement and wake rules keep their existing explicit per-conversation opt-ins ([ADR-0109](0109-external-group-collection-is-separate-from-wake.md), [ADR-0110](0110-external-thread-following-is-scoped-and-explicit.md), [ADR-0112](0112-channel-bridge-intake-is-managed-at-the-existing-grant.md), [ADR-0119](0119-external-platform-defaults-retain-explicit-inheritance.md)).

Default traffic is limited to what the Provider has qualified for that platform. At the time of writing that means Lark DMs and group mentions, Slack public-channel mentions ([ADR-0126](0126-slack-text-intake-uses-exclusive-checked-provider.md)), Discord guild-channel and public-thread mentions ([ADR-0128](0128-discord-checked-replies-preserve-native-child-channel-routing.md)) and the WeChat QR-paired owner DM ([ADR-0129](0129-wechat-owner-dms-use-private-source-continuations.md)). Each event kind becomes eligible only after its own qualification. The bind dialog shows what the app will actually receive.

**One account-level registration per Binding.** Binding acquires the account's exclusive Provider Consumer through the existing fanout ([ADR-0120](0120-multiple-bridge-routes-retain-canonical-sources.md)). This is the same registration Lark pairing already holds ([ADR-0136](0136-lark-pairing-is-reviewed-bot-scoped-operational-authority.md)), now available on every qualified platform. Its dispatcher runs in this order:

1. Deterministic control intake: `/pair`, approval card actions ([ADR-0141](0141-lark-private-approvals-rejoin-the-native-owner-through-checked-controls.md)).
2. The conversation's existing entry, if one is active, with its saved collection, routes and policies.
3. A durable block for the conversation (see Revocation sticks): the message is acknowledged without admission.
4. Default traffic, subject to the Binding's new-conversation mode and bounds.
5. Anything else is acknowledged without admission.

No message creates more than one canonical Source Event per account, conversation and message, and no second listener or Provider Session is introduced. Admission, deduplication, acknowledgement after commit, the receive-after boundary and restart recovery stay with [ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md).

**Conversations are entries recorded on first admission.** The first admitted message from a conversation without an active entry commits, in the same transaction as its Source Event and Inbox Admission, an implicit _conversation entry_. That is a `messaging_grants` row with `origin: 'implicit'`, the Binding, the authenticated conversation kind and ID from the event, and a revision. It does not have a saved target reference or digest. It exists so that Source Events, Outbox Intents, group and thread policies, Channel Bridge routes and revocation keep the single anchor they already reference. An implicit entry authorizes four things: receiving that conversation's default traffic, checked replies to Source Events admitted through it, bounded context and file reads anchored on those sources, and proactive posts to that conversation (see below). A DM entry uses the existing DM source policy. A group entry starts at mentions-only collection, inheriting platform defaults.

**New-conversation mode.** Each Binding stores one of two modes:

- `auto` (default for new Bindings): default traffic from a new conversation creates an implicit entry and is admitted.
- `ask`: the first message creates a _held_ entry and is acknowledged without a Source Event, Inbox Admission, wake or retained content. A held entry stores only the conversation kind and ID, first and last seen time, a bounded message count and presentation-only names. Allowing a held entry makes it active for future messages. Earlier messages are not backfilled.

Auto-creation is bounded: at most 20 new entries per Binding per rolling hour and 500 active entries per Binding. Past either bound, new conversations become held entries rather than admitted ones. Each Binding retains at most 200 held entries, pruning the oldest.

**Revocation sticks.** The person can mute, change reception rules or block an entry:

- **Mute** sets that conversation's wake to `silent`. Messages are still admitted and readable, and replies stay possible.
- **Block** revokes the entry: the revision increases, unstarted Outbox Intents become `grant-revoked`, leases are fenced and history stays readable. It also writes a durable block keyed by Bot, account fingerprint, conversation kind and conversation ID. While a block exists, that conversation's messages are acknowledged without admission and never recreate an implicit entry. This holds in `auto` mode, across restarts, and when the same app is unbound and later rebound to the same Bot.
- **Allow again** is an explicit, revision-checked command. It removes the block and creates a fresh entry for future messages. Earlier messages are not backfilled and earlier policies are not revived.

Unbinding still invalidates every entry of that Binding. It does not delete blocks.

**What stays explicit.** Some authority is never derived from app membership or default traffic:

- Operational authority for external users: pairing review ([ADR-0136](0136-lark-pairing-is-reviewed-bot-scoped-operational-authority.md)).
- Approval destinations and decisions ([ADR-0141](0141-lark-private-approvals-rejoin-the-native-owner-through-checked-controls.md)).
- Proactive posts to a conversation the Bot has never seen: these still need a Service Grant on a Provider-saved target ([ADR-0038](0038-provider-capabilities-and-service-grants-gate-external-actions.md), [ADR-0117](0117-external-only-reports-use-owned-outbox-correspondence.md), [ADR-0139](0139-wechat-external-reports-use-private-owner-context.md)).
- Ordinary-text collection and thread following.
- Placement into a local Channel (External connectors).
- Another Bot's replies.

**Proactive posts follow the entry.** The platform already lets the app send to any conversation it belongs to, and that is what a person expects a bound Bot to do. So an active entry (implicit or explicit) also authorizes `bridge_post`, reports and Profile sends to that conversation, through the Bot's own app. The authority comes from the entry, never from message content. These guards apply:

- The destination is chosen from the Bot's own active entries by entry ID. A conversation ID written in a message, a tool argument or another Bot's output never names a destination by itself.
- Held, blocked and invalidated entries cannot receive posts. A muted entry still can, because mute only silences wake.
- Each entry is limited to 10 proactive posts per rolling hour, and each Binding to 60. Past the limit, the Outbox Intent fails as `post-rate-limited` and the Bot is told why.
- Each post is an Outbox Intent with the same final fences, receipt checks and audit trail as today. Block revokes the entry and fences unstarted posts as `grant-revoked`.
- Posting to an entry without a saved target needs an optional Provider capability that addresses a conversation by account and authenticated conversation ID. Without it, the Client says the Provider must be updated, and saved-target posts keep working.

Under [ADR-0122](0122-shared-source-replies-use-responder-owned-authorization.md), a responding Bot needs its own active explicit or implicit entry for the source's external conversation. Reading a shared source never creates that entry. When one Bot has active entries for the same conversation under more than one of its apps, the shared reply refuses as `reply-target-ambiguous` rather than guessing.

**One app, one Bot; several apps per Bot.** The existing partial unique indexes on `(provider_id, account_ref)` and `(provider_id, fingerprint)` keep each app bound to at most one Bot. The `messaging_binding_bot_platform` index and the matching `bot_slug = ? AND platform = ?` conflict checks in the identity bind and authorize commands are removed, so a Bot can bind several apps of one platform. Each Binding keeps its own registration, entries, defaults inheritance, pairing receiver and blocks. The same platform message seen by two of one Bot's apps produces two Source Events under two fingerprints. They are not merged, because the apps are distinct platform identities.

**One-step binding in the Client.** The Bot's External identities entry offers **Bind app** (绑定应用). The person picks a platform, then either an already-connected app that no Bot uses yet, or creates a new one inline. Apps used by another Bot are not offered. After the commit, the Binding's registration is acquired and the dialog reports readiness using that registration's real state. Each app row opens its conversation list (active, muted, held, blocked), where mute, rules, block and allow-again are available. Placing a conversation into a local Channel moves to that conversation's row. The External connectors entry is left for one-way input streams, such as webhooks, in a later decision. Saved-target grants for conversations the Bot has not seen stay in the advanced section. A BotHarness-owned **IM apps** list in Bot settings shows every Provider account, the Bot that uses it, and a link to the Provider settings for credentials. The Provider's own settings list is not modified by this decision.

**Inline app creation stays Provider-owned.** Credential entry, Lark/Feishu app setup and WeChat QR pairing are Provider operations. The Bind dialog calls a versioned, optional Provider setup capability on the public same-Host Service and receives only the new opaque account reference and authenticated account description. Secrets and QR tokens go from the Client to the Provider's own settings transport. They never pass through or persist in the BotHarness Host, the Operational Database, logs or Memory ([ADR-0006](0006-feishu-secrets-in-dsh-credentials-service.md), [ADR-0127](0127-product-artifacts-compose-an-independently-versioned-im-provider.md)). An account created this way starts in `external-consumer` mode, so no standalone Provider Session answers it before it is bound. Without the setup capability, the dialog falls back to opening the Provider settings and then returns to the same bind step.

## Security trade-off

The explicit per-conversation Grant guaranteed that no conversation reached a Bot until a person had picked it. Under this decision, anyone the platform lets reach the app can put a message into the Bot's Inbox and wake its model. That includes any member of the app's availability scope, anyone who shares a group the app was added to, and anyone a group administrator lets add the app to a new group. Their messages can consume model budget and try prompt injection. The reasons to accept this:

- Admission was never authority. External content stays untrusted, gains no Memory acceptance authority ([ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md), [ADR-0113](0113-shared-external-traffic-uses-member-channel-harvest.md)) and grants no tool approval, pairing or Workspace Grant. It cannot name a proactive destination either: posts go only to the Bot's own entries, chosen by entry ID and rate-limited.
- Replies only go back to the checked original route, through the Bot's own app, after the existing final fences.
- The platform controls that now gate admission are the controls the app's owner already configures for every other bot on that platform. The person can restrict the app's availability, remove it from groups, use `ask` mode, mute, or block.
- Proactive posts add the risk that injected text in one conversation steers the Bot into posting elsewhere. Destinations are limited to the Bot's own entries, which are conversations the app already belongs to and has received from. Per-entry and per-Binding rate limits cap the damage, and block stops it.
- Auto-creation bounds keep a flood of new conversations from turning into unbounded admissions.

Each Bot's apps remain its own: a Binding never lets another Bot receive or speak as that app.

## Migration

Operational Database generation 61 and later generations, appended after the published generation 60, cover these changes:

- They add `new_conversations` to `messaging_bindings`. Every Binding, existing or new, gets `auto`. The plugin has no users yet, so existing Bindings move straight to the target behavior instead of keeping today's opt-in.
- Existing Grants become explicit entries (`origin: 'explicit'`) with unchanged revisions, saved targets, receive scopes, routes and policies. A Grant without a receive scope stays an outbound-only entry.
- Every revoked Grant that had a receive scope becomes a block, so the move to `auto` cannot quietly reopen a conversation the person had revoked.
- A partial unique index allows only one active entry per Binding, conversation kind and conversation ID.
- The `messaging_binding_bot_platform` index is dropped.

The existing migration owner takes its pre-upgrade snapshot and validates the staged database. An older Bundle must not open the new generation; rollback uses the matching snapshot or a forward fix. Source Events, Admissions and Outbox history are not rewritten. A code revert does not undo admitted messages or accepted replies.

## Alternatives

- **Keep per-conversation Grants but make them one click:** rejected. The person still has to learn each conversation exists before the Bot can hear it, and a DM from a new colleague still disappears.
- **Auto-grant every conversation including ordinary group text:** rejected. Collection volume and Memory exposure would follow group size rather than the person's choice.
- **Treat app membership as cross-Bot authority:** rejected. It breaks [ADR-0122](0122-shared-source-replies-use-responder-owned-authorization.md)'s responder-owned identity.
- **Identify the app by display name or a Provider bot ID without fingerprint:** rejected for the same reasons as in [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md).
- **Put "used by Bot" labels into the Provider's settings UI first:** deferred. The Binding is BotHarness authority, so BotHarness projects it, and a Provider label can follow as an upstream contribution.

## Consequences

`CONTEXT.md` needs the terms _conversation entry_ (implicit, explicit, held, blocked), _default traffic_ and _new-conversation mode_. It also needs to say that the UI calls a Provider account an app (应用). The living architecture's Messaging section changes from Grant-keyed reception to Binding-keyed reception with conversation entries. Lark, Slack, Discord and WeChat guides drop the delivery-target and conversation-authorization steps for receiving and replying, and for proactive posts to conversations the Bot has already seen. They keep them only for posting to a conversation the Bot has never seen. The Provider setup capability and the conversation post capability need its own qualified Provider version and real-platform evidence before inline creation ships. Real platform testing still needs one exclusive receiver per app ([ADR-0136](0136-lark-pairing-is-reviewed-bot-scoped-operational-authority.md)).
