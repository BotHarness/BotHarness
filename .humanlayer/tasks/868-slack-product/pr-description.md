Closes #868 · Refs #822, #863 · [qualification evidence](https://github.com/BotHarness/BotHarness/blob/codex/868-slack-product/docs/assets/pr/868-slack-product/README.md)

## Why the change

Product packages inherited the developer Provider pin without changing their own version, so this change fixes their input independently and qualifies the accepted Slack behavior through actual installed tarballs.

## Special things to note

- Merge risk: **two-way door** — revert the product qualification/version and rebuild; **medium blast radius** — future product artifacts and their isolated CLI selection, where a wrong input can prevent startup or messaging; review the immutable digests, provenance and installed-artifact proof. No database/schema migration.
- Provider `4.32.0-botharness.3` selects reviewed fork head `a0300e97`; credentials, canonical state and authorization remain in the existing QA Profile after an explicit backed-up switch. Empty installation starts disconnected. This does not publish npm or alter #866's release workflow.
- Validation: full tests **2,493 passed / 9 skipped**, final focused **32 passed**; lint, format, types, build, changelog and 322-page docs build passed. Real Slack/model replies passed before and after cold restart; PR creation pauses for Human QA.

## Change outline

```diff
 productImProvider
- version: 4.32.0-botharness.2
- upstream: qualifiedImProvider (development selection)
+ version: 4.32.0-botharness.3
+ upstream: frozen product source / DSH / runtime integrity record

 packaged CLI qualification
- select DSH from developer pin
+ select DSH from verified product artifact inventory
```

```text
four verified tarballs
  → official isolated DSH CLI
  → one native Bundle: Core + Client + IM Provider
  → own authorized Slack identity
  → canonical Source Event / Bot Inbox
  → real model reads retained report and replies
  → original native Slack thread
  → cold restart, new source, same report and own identity
```

The regression deliberately changes the development selection while asserting that product provenance stays fixed. Source-input and rebuilt-runtime integrity checks remain enforced. Installation docs, ADR-0127, bilingual architecture/guides and release ledgers describe the independent qualification boundary.

These are actual packaging/runtime states, not a UI-layout change: Chinese dark theme, BotHarness 1230 × 820; native Slack 1230 × 876. No secrets or credentials are included.

**Fresh product: three running native components**

![Fresh product: three running native components](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/868-slack-product/docs/assets/pr/868-slack-product/fresh-components.png)

**Fresh product: Provider .3 remains disconnected**

![Fresh product: Provider .3 remains disconnected](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/868-slack-product/docs/assets/pr/868-slack-product/fresh-slack.png)

**Retained authorized account: installed product online**

![Retained authorized account: installed product online](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/868-slack-product/docs/assets/pr/868-slack-product/connected-product.png)

**Post-install message: original report association**

![Post-install message: original report association](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/868-slack-product/docs/assets/pr/868-slack-product/product-source.png)

**Cold restart: new message retains original report**

![Cold restart: new message retains original report](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/868-slack-product/docs/assets/pr/868-slack-product/restart-source.png)

**Native Slack: both real model replies in the report thread**

![Native Slack: both real model replies in the report thread](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/868-slack-product/docs/assets/pr/868-slack-product/native-final.png)

Agent-Task: `codex/local/01a0f14c-5338-7020-853b-0fe54b87aa95`

Agent-Claim: https://github.com/BotHarness/BotHarness/issues/868#issuecomment-5993103768
