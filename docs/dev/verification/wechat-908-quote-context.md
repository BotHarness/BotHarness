# WeChat #908 quote and retained-context qualification

## Installed product and real input

The paired-owner DM sent the original and then used WeChat's native Quote action. The #908.4 product was installed through the normal isolated Profile launcher with the existing pairing and Grant. The qualified Provider fork is `e330c9ea0996935fd1266b8db358579e81de4d61` (`4.32.0-botharness.10`).

The quote Source Event is `im-4947324048808a68fbea96096e24af77d1240b5d6c8d100e79a8c624725e64d5`, message `7513277200861311752`. The actual native quote supplied only item ID `7513277167155861768`; there was no embedded body or server message ID. Resolution stayed `unavailable/no-server-message-id`. Item ID equality with the original message ID was not promoted into server-ID authority.

## Actual model behavior

| Call             | Actual arguments / result                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `bridge_read`    | Read the quote Source Event; quote explicitly unavailable.                                                              |
| `bridge_context` | `retained`, budget 1,000; returned the quote Source Event, incomplete.                                                  |
| `bridge_context` | Same source/scope, preceding opaque cursor, budget 24,000; returned the original Source Event, complete.                |
| `bridge_context` | `retained-nearby`, 10 before / 5 after, budget 24,000; returned the original Source Event.                              |
| `bridge_reply`   | `BH908-QUOTE-OK 紫色风铃42`, original authorized private conversation; Provider accepted with a client acknowledgement. |

The original Source Event is `im-6397f4350c462c82e4194f4a2a0037335d534c475a1140e7c593f5e83966168c`, message `7513277167155861768`. Both source Admissions were handled. The Bot's local DM remains empty. Recipient delivery confirmation and its native screenshot are still pending.

## UI and boundaries

The real quote, expanded native item ID, three read-audit records, and retained original were captured in matched Chinese light/dark views at 1,230 × 820. The merged #907 package was briefly installed against the same stored #908 test records for the baseline: its Client rejects the new retained-context scope. This comparison demonstrates the new-record compatibility boundary, not a claim that ordinary #907 sources failed. The #908 product was restored afterward; pairing and authorization were preserved.

The walkthrough video uses genuine CUA screenshots of the Inbox entry, quote view, expanded fields, and read audit. It is a keyframe walkthrough rather than a continuous screen recording. Reproduce in the live QA Profile: open **WeChat 引用上下文 QA #908 → Bot 收件箱 → 扫码绑定者私聊 → 已处理或忽略 → BH908-QUOTE**, expand **引用详情** and **读取记录**, then inspect the original in **Bot 读取的上下文**.

Embedded-body, genuine server-ID lookup, unknown references, receipt provenance, budget retry, revoked authorization and stable local cursor snapshots are regression-tested. They are not asserted as separately exercised native WeChat client variants. Local retention is not remote WeChat history or search; a quote never creates a Thread. Provider acceptance is not recipient delivery proof.

## Checks

Final full regression: 2,919 passed / 9 skipped. Provider WeChat tests: 209 passed. Lint, typecheck, formatting, bilingual Release Ledger and packaged product build pass. See the PR for the final docs build, native recipient confirmation and exact-head CI status; no release or deployment is implied.
