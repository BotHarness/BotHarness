---
Status: Accepted
Date: 2026-10-07
---

# Lark pairing is reviewed Bot-scoped operational authority

A community user may talk to a PersonaBot without becoming its operator. A real Lark private message can request management access, but only the authenticated Web Human chooses the initial capabilities. This is the first runnable slice of [#1019](https://github.com/BotHarness/BotHarness/issues/1019), delivered by [#1027](https://github.com/BotHarness/BotHarness/issues/1027). IM approval and native question controls are subsequent slices.

## Decision

The application-defined pairing owner is `messaging/pairing.ts`, using the Messaging module of the existing Operational Database. A pairing identifies one PersonaBot, one current external identity Binding, and the user identity authenticated by the qualified Messaging Provider. It does not identify a Human by their message text, a display name, a copied locator, or an API token. The Provider remains responsible for the SDK, credentials and checked account identity.

A bound, enabled Lark identity acquires an account-level registration on the existing exclusive Consumer fanout. Its deterministic control dispatcher handles a plain `/pair` in a private conversation before any ordinary reception route. It validates the account fingerprint, user identity and exact original DM reply route, commits a pending request, then acknowledges consumption. This control message creates no Source Event, Bot Inbox Admission, model wake or Memory write. Group commands, malformed control commands and attached control messages are consumed without creating authority. Other messages still require their ordinary reception authorization.

The account registration shares one underlying Provider Consumer with ordinary conversation routes. Removing a conversation route does not remove the pairing entry point; it also does not create ordinary DM intake. Provider disposal, identity pause and Host shutdown release or fence the registration. Startup retries only transient Provider readiness failures, with delays of 250 ms, 1 s and 3 s. A fingerprint mismatch does not retry into a different account. The Client projects the actual registration's connecting, ready, paused or unavailable state.

The acknowledgement is scheduled after the Provider callback returns. The qualified Provider runs callbacks inside its account transition queue, so awaiting a checked reply inside that callback would deadlock the same queue. The reply checks the original identity and route again immediately before sending. A failed or uncertain acknowledgement cannot grant permission; the durable Web request remains the authority.

The existing authenticated Typert/API Gateway Bridge exposes request review. Approval requires a nonempty, explicit selection from `approve`, `reject`, `answer` and `save-rules`, the request ID, the current revision, an active Binding and an unexpired request. No checkbox starts selected. The first applicant receives no special privilege. The UI displays the receiving account and genuine Provider user information; a missing platform name is labelled as missing, and the full user ID is available through a disclosure. A display name is never the authority.

Approved capabilities apply only to that Bot and Binding. The pairing assertion rechecks current status, Binding, Bot, actor and requested capability on each use. It does not grant other-Bot access, management of approvers, a Workspace Grant, VPS access or native DSH API access. The present slice stores and checks these capabilities; it does not implement IM approval buttons, native question responses or saved automatic rules.

Revocation is a revision-checked durable transition that clears capabilities immediately. Re-pairing creates a fresh pending request with no inherited capabilities. Unbinding an identity invalidates its authority permanently; a replacement Binding requires new review. Pausing a Bot or identity makes its authority unavailable while paused, without pretending that a temporary suspension is a permanent revocation. Pairing state survives Host restart in the Operational Database.

## Bounds and audit

- A pending request expires after 10 minutes. This expiry applies to the application, not to an already reviewed grant.
- A user can make five distinct attempts for one pending request. Redelivery of the same Provider message ID does not spend another attempt or create another grant; at most five message IDs are retained on that request.
- The Profile accepts at most 200 pending requests, each Bot at most 25 pending requests and 100 approved pairings. Expired requests free pending capacity when a new request is processed.
- The Web shows all pending/approved records and the latest 20 terminal records. Its bounded history is a projection; it is not another authority store.
- The random 10-character locator identifies a request. It cannot redeem access and is not a bearer secret. Review records time, revision and the authenticated Web origin.
- Operational state contains platform IDs and bounded redelivery evidence. It is private Profile data, never exported to the Bot's public Memory repository. Lifecycle diagnostics contain stable phases and refusal reasons, never credentials or message text.

## Alternatives

Issuing an API token for a user to paste into IM was rejected: it creates a transferable secret and unnecessarily mixes native API authority with a Bot's management scope. Automatically trusting the first applicant was rejected because anyone can reach a community Bot before its maintainer. Prompt instructions and model-generated replies cannot establish authorization. A second SDK listener or a standalone IM Session would compete with the qualified Consumer and bypass canonical reception ownership.

## Consequences

This adds Operational Database generation 58. The existing migration owner takes its pre-upgrade snapshot and validates the staged database. A running upgraded Profile must not be opened by an older schema writer; rollback needs the matching pre-upgrade snapshot or a forward fix, rather than merely an older Bundle.

A real platform test must use an exclusive application receiver. The qualified Provider's connection supervisor reinitializes configured accounts every 15 seconds, so its single-account `bot.disconnect` command alone is insufficient to hold an application offline during testing. Prepare a dedicated application or explicitly authorize a temporary Host shutdown, and restore the original runtime afterwards. This testing limitation does not weaken pairing or platform authorization.
