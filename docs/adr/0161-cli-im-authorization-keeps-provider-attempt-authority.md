---
Status: Accepted
Date: 2026-10-10
Issues: [#1318](https://github.com/BotHarness/DeepSeekBot/issues/1318)
---

# CLI IM application authorization keeps Provider attempt authority

IM application authorization is owned by the qualified `dsh-im` Provider. BotHarness Messaging target grants and PersonaBot external identity selection are separate application-defined behavior. The CLI must use the same Provider attempt as the existing Client authorization flow, including provider-required Human scanning or verification.

## Decision

- Discover supported flows from the existing application-defined Messaging Service `messagingApps` projection. Accept only version 1 Feishu/WeChat descriptors with the qualified Provider identity, expected flow kind and exact `dsh-im/app-setup` endpoint.
- Use the native DSH Connection Fetch Registry endpoint through the authenticated unary carrier selected in ADR-0159. Its payload is `{method: 'setup.start|poll|credentials|verify|cancel', payload: {...}}`, rather than the BotHarness Bridge `{args}` envelope. No new Service Provider, listener, database or Client lifecycle is introduced.
- The Provider owns opaque, process-local attempts, their expiry (at most ten minutes, shortened by native provisioning), provisioning and native account/credential persistence. Separate CLI invocations poll the same `attemptId`; Host restart or expiry requires a new attempt. The CLI stores neither attempt state nor cookies.
- App credentials and phone verification codes enter through stdin only. They travel solely to `setup.credentials` or `setup.verify` over the authenticated connection. This narrows ADR-0159's earlier no-secret-payload assumption: authorizing an IM application necessarily submits its credential to the existing owner. Secrets never appear in argv, stdout, stderr or generic BotHarness RPC payloads.
- Project only validated attempt identity, platform, state, expiry, native PNG QR data URL and ready account identity/fingerprint/connection status. Drop arbitrary Provider fields and names. Submission errors use a bounded code vocabulary and generic messages; failed commands retain the known attempt ID for inspection.
- Waiting stops at ready or a Human-action state (credentials or phone verification). A deadline returns a resumable attempt receipt. No request is automatically restarted. Cancelling a pending attempt does not revoke a ready native account.
- Authorization does not select a PersonaBot or create a Messaging Grant. `pairing-status` names the CLI authorization-attempt poll; offline `pairings <bot-id>` continues to inspect Bot administrator pairing requests.

## Considered Options

- Reusing `messagingAuthorize` would authorize an outbound target Grant rather than an IM application and was rejected.
- Persisting a CLI attempt store or reproducing provisioning would split authority from the Provider and was rejected.
- Bypassing provider-required Human scanning or code entry would misrepresent the native authorization flow and was rejected. Nonsecret QR artifacts and next-step prompts provide the relay instead.

## Consequences

The first slice exercises a real WeChat QR through the production Provider, then polls that same attempt. Feishu accepts an existing application ID/secret through stdin. The qualified source is `@xmanrui/dsh-im` 4.32.0 at `bddd7d93e1c1b969ce137721c2494f6d72bfa8bc`, with DSH `0.2.0-rc.1`; future Provider contract changes need renewed qualification. Its management endpoint may refuse nonlocal requests even when the common CLI carrier accepts a tailnet HTTPS origin. A failed start without an attempt ID has an unknown provisioning outcome until the Provider expires its attempt; do not blindly retry.
