# ADR-0138: WeChat external reports use private owner context

- Status: Accepted design; candidate qualification and Human QA tracked on #910
- Date: 2026-10-07
- Issue: [#910](https://github.com/BotHarness/BotHarness/issues/910)

## Context

A PersonaBot needs to send a requested text report to its explicitly authorized QR-paired owner DM without a new incoming WeChat message or a local Human DM mirror. iLink requires private conversation context. A successful HTTP response or client-generated message ID cannot prove that the recipient received or read the report.

## Decision

Extend the existing DSH Service Definition → Provider → Consumer capability seam and application-defined Messaging Outbox. `bridge_targets` discovers existing report-capable Grants, `bridge_post` and the existing Profile send form call the same canonical post operation. The Outbox owns report content, request identity and honest outcome; this adds no Channel placement, Inbox Admission, Scheduler or Provider Session.

Qualify WeChat posting only when the Provider explicitly negotiates receipt and final-send-fence versions. BotHarness rechecks the acting Bot, Provider Registration, enabled Binding revision and Grant revision immediately before the native send. The Provider serializes the send with its account transitions and independently checks the current fingerprint, paired owner, cancellation and final callback. A shared source reader never borrows another Bot's identity or Grant.

Reuse the Provider's existing private per-owner context cache. Only an authentic inbound owner message can refresh it for the same account fingerprint. Native ordering prevents older or duplicate arrivals from replacing newer context. A local 30-day retention ceiling is a storage bound, not a promise of server validity; re-pairing, missing context and local expiry refuse. The native server can reject a locally retained context earlier. No context token, credential or transcript copy enters the public snapshot or canonical Outbox.

Record a client acknowledgement with `identityKind: client-acknowledgement`. Preserve a genuine native server message ID separately when the native response actually supplies it, as an exact decimal string. The Client labels these separately and states that Provider acceptance proves neither delivery nor reading. A rejected send is a definite failed operation; an uncertain network result stays unknown. Reusing the same request ID inspects the existing outcome without sending again.

Missing context or native send rejection gives a recovery instruction: send a fresh message in the original paired DM, check current authorization/intake, and explicitly request a new report. Never renew context with synthetic heartbeats, blindly retry an unknown outcome, infer a fixed server TTL from an error code, or substitute another conversation.

## Qualification boundary

The candidate builds on the main-qualified fork `4fddcf7223e22a406989236f1e03a4af752b83f6`, retaining Lark image and existing WeChat media/quote paths. Provider input `4f4f0a6282580bb59968eb90571778eb7e37ee73` has 397 runtime files and SHA-256 `8c8d34fb8e85cb9845ca05d0cbc691d9a3373f051efa2da9e614315791975f98`; the managed product candidate is `4.32.0-botharness.12` on DSH `0.2.0-rc.1`. Real receipt, follow-up Inbox intake and packaged-product qualification require separately recorded evidence. Merge, publication and deployment remain Human decisions.
