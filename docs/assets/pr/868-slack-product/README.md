# Slack product artifact qualification — #868

Base: `070b74a1a69e26a2d4f082170587d488725f2857`.
Implementation: `98fe70c138e48dbb93570eecd5b369a9304b9b84`.
Product test version: `0.0.0-test.868`; first-party Provider: `4.32.0-botharness.3`.
Input: fork `a0300e97d7996a5de3a6da2f5b9f50224eb12bd9`, DSH `0.2.0-rc.1`.
The input has 393 runtime files; the rebuilt, product-managed artifact has 394. Exact source and rebuilt runtime hashes, package integrity, bounded Source Event/Outbox records and assertions are in [proof.json](proof.json).

## Real installed-artifact checks

1. Build Core/Client and pack four local tarballs using the product installation guide. Install them through the official isolated CLI; verify a single native Bundle with three running components. The empty Profile initially has no account and opens Slack's disconnected state.
2. Stop this task's previous developer-linked receiver and back up its retained QA Profile. Explicitly replace the standalone fork/Core/Client developer links with the four tarballs. Keep the existing authorized Slack account, credentials, canonical database and Grant in that same Profile; do not copy credentials into the empty Profile.
3. Through the real Slack Human UI, mention the own QA Bot in the previously published report thread with `[BH868 PRODUCT]`. The model reads the new Source Event and existing Outbox report, then uses its own checked identity to answer `BH868-PRODUCT-OK` in that native thread.
4. Stop the exact task-owned Host and cold-start the same packaged Profile. Mention it with `[BH868 RESTART]`; the new source is handled and the model answers `BH868-RESTART-OK` in the original report thread.
5. Independently check native Slack replies and BotHarness's source modals. Both new sources have one handled Bot admission and zero Channel placements. The original report row remains identical to the backup; a changed input runtime file is rejected before packaging.

All screenshots are actual browser captures in Chinese, dark theme. BotHarness frames are 1230 × 820; the native Slack frame is 1230 × 876. These are packaging/runtime qualification states; this change does not alter UI layout or styling.

| Image                                          | What it proves                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [fresh-components.png](fresh-components.png)   | Empty product installation: three native components running        |
| [fresh-slack.png](fresh-slack.png)             | Provider `.3`, product-managed updates, no auto-connected account  |
| [connected-product.png](connected-product.png) | Retained authorized account online in the installed product        |
| [product-source.png](product-source.png)       | Real post-install source linked to the previously published report |
| [restart-source.png](restart-source.png)       | New post-restart source preserves that report association          |
| [native-final.png](native-final.png)           | Both model replies visibly delivered to the original Slack thread  |

## Automated verification

- Full tests: 2,493 passed / 9 skipped.
- Final focused product/provider tests: 32 passed, including independence from a deliberately altered developer pin.
- Lint, format, types, changelog validation, build and documentation build passed; docs generated 322 pages.
- Chinese OG font regenerated after docs sync; output unchanged.

## Limits

Only the existing authorized Slack QA app and public test channel were used; no scopes changed. The final receiver is Inbox-only/mentions; the shared Channel route stays paused. The empty Profile does not prove a newly entered account setup. This evidence does not claim npm publication, production deployment, morning scheduling, private/DM outbound support or Discord qualification. Registry release work remains separately owned by #866.
