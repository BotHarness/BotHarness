# IM application authorization CLI qualification

Issue: [#1318](https://github.com/BotHarness/DeepSeekBot/issues/1318). Baseline: merged P2 `ef4d3374`. Qualification: 2026-10-10, DSH `0.2.0-rc.1`, qualified `@xmanrui/dsh-im` 4.32.0 at `bddd7d93e1c1b969ce137721c2494f6d72bfa8bc`.

## Real Provider path

An isolated Profile was launched with `scripts/dev-instance.mjs --im-provider --json`. Every probe invoked the built public `deepseekbot` executable, supplying Host authority through private environment values. Login used the existing token-to-cookie flow; attempts stayed Provider-owned.

| Probe                                                                   | Observed result                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `im-apps`                                                               | Qualified Feishu credentials and WeChat QR descriptors discovered                                            |
| `im-authorize weixin`                                                   | Real native PNG QR and opaque attempt ID returned                                                            |
| Expired QR                                                              | Original attempt returned `authorization-expired` with its ID                                                |
| `pairing-status <id> --wait --timeout 45`                               | `authorization-timeout` preserved the same pending attempt, without another start                            |
| Human phone confirmation, then independent `pairing-status <id> --wait` | Same attempt became `ready`; native account reference present, 64-hex fingerprint present, `connected: true` |
| `im-authorize feishu`, then independent poll with `--wait`              | `credentials` and stdin submission prompt returned immediately                                               |
| `im-cancel` on that pending Feishu attempt                              | `cancelled`, exit 0                                                                                          |
| Poll cancelled attempt                                                  | `authorization-cancelled`, exit nonzero                                                                      |
| Poll unknown attempt                                                    | `setup-expired`, exit nonzero, known attempt receipt retained                                                |

The Human confirmed the WeChat account was authorized and connected. The QR initially failed to render from a temporary local image path in chat; it was relayed through the T3 native preview by displaying the CLI's exact data URL, then capturing a native preview screenshot. That artifact display is not a rendered BotHarness Client change or evidence of Client readiness. The unauthenticated native Host page was inspected separately and returned the expected authentication gate with no console entries. No launch token, QR, phone number, account reference or fingerprint is committed here.

Real Feishu credential acceptance and a phone verification challenge were not exercised: this run had no Feishu app credential and WeChat did not request a code. The native envelopes, stdin-only submission, response projection and secret-echo rejection are covered by authenticated carrier tests. No implicit PersonaBot identity selection or conversation Grant was created.

## Regression and repeat path

Cancelling the already ready WeChat attempt preserved `ready` and `connected: true`, confirming native account retention. Independent Standards/Spec review found two gaps before publication: connection/login failures lost the known attempt receipt, and a shape-valid Provider response could echo a submitted secret in an allowed identity field. Both were fixed with regression coverage, including Host-down/refused login and credential/code echoes. The existing Messaging apps RPC test also leaked its directly created database owner, causing Windows cleanup `EPERM`; it now registers that owner with the existing teardown helper, and both tests pass.

Targeted CLI tests cover existing P1 creation and P2 send behavior alongside the new Provider-owned flow, including protocol mismatch, unsupported capability, cross-invocation polling, terminal failures, bounded deadlines and same-attempt/platform correlation. Typecheck, lint/source policy, bilingual ledgers, formatting and production build are required before publication.

After a verified isolated Host launch and `pnpm build`, run `im-apps`, `im-authorize weixin`, display `authorization.qrDataUrl`, and scan/confirm on a phone. Poll the returned ID; do not start another attempt on a command timeout. Feishu uses `im-authorize feishu` followed by private JSON stdin with `appId`, `appSecret` and `domain`. Do not put credentials or phone codes in arguments or chat. The Provider expiry is at most ten minutes and can be shortened by native provisioning.
