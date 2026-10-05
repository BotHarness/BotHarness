# Discord mention/reply tracer — live checkpoint

- Issue: [#855](https://github.com/BotHarness/BotHarness/issues/855)
- Date: 2026-10-05, Asia/Tokyo; live channel/thread probes at 20:00 and 20:02
- State: first live tracer passed; Human QA and wider qualification pending
- BotHarness baseline: `751d88871ae9f3b25d8ef0381a3f1673330537b6`; tested runtime implementation: `ea5ca546`. Later commits change documentation only.
- Provider: [`e6f0de2a989c28d20db92c0e7f43b20c6d3028b9`](https://github.com/DoodleBears/dsh-im/commit/e6f0de2a989c28d20db92c0e7f43b20c6d3028b9), 394 runtime files, SHA-256 `2d1f6c0d313cf044024e7e2609070934249e4a00a4a777f09aa45b2dd2c89727`
- DSH: `0.2.0-rc.1`; dedicated isolated QA Profile, one connected Discord receiver, explicit `discord.consumerMode: external-consumer` configured before account connection

## Observed real behavior

The Human authorized a dedicated App/Bot and new QA server. Native authenticated user/Application identity matched, Gateway connected, and the QA Bot identity was bound to one PersonaBot. Setup used the existing authenticated Host commands; Human operation of the binding/source UI remains a QA item. A real model DM probe passed before the external probes.

Human messages were sent through Discord's real browser composer using the native Bot mention selection. Both external messages were handled in the existing Orchestrator through `bridge_read`/`bridge_reply`. Each has one canonical Source Event, one Inbox Admission and one provider-accepted reply intent. Bot echoes did not create another source/admission. No external message was mirrored into the Human DM. The same existing Orchestrator Session completed both turns; no standalone Provider Session was created.

| Native destination                           | Human source          | Native Bot reply      | Body                     |
| -------------------------------------------- | --------------------- | --------------------- | ------------------------ |
| Text channel `1556616665385668620`           | `1556622054449741878` | `1556622087748329583` | `DISCORD-CHANNEL-855-OK` |
| Existing public thread `1556622420222283798` | `1556622609456828550` | `1556622648673439765` | `DISCORD-THREAD-855-OK`  |

Independent native GET Message read-back confirmed Bot author `1556613973846007899`, exact destination, body and reply-source reference for both replies. Native thread read-back confirmed type 11, parent `1556616665385668620`, QA guild `1556616664202739732`, unarchived/unlocked. The Human created this thread before its mention; the Bot reused it. Outbox retains the parent conversation plus exact child-channel `threadId`.

## Actual Discord screenshots

Chrome desktop viewport 1230 × 820, dark theme, Chinese locale. Captures below use the native screenshot crop (855 × 820) to omit unrelated server/account navigation; message pixels are not edited or generated.

![Real original-channel mention and model reply](../../assets/pr/855-discord/channel-live.jpg)

![Real existing-public-thread mention and model reply](../../assets/pr/855-discord/thread-live.jpg)

These are live candidate interaction evidence, not a latest-main UI before/after pair. Baseline main does not admit Discord checked sources. Capturing the affected local Inbox/source UI was blocked by Chrome `ERR_BLOCKED_BY_CLIENT` for the isolated loopback page. Do not treat native Discord images as visual acceptance of BotHarness UI. Human QA must open the isolated Profile, inspect the identity/source UI and confirm the source label and canonical details; capture matching main/PR views where a comparable state exists.

## Repeatable QA path

1. Use a fresh isolated DSH Profile and candidate Provider source above, retaining the qualified product Provider pin for existing integrations. Add the candidate as the Profile's `@xmanrui/dsh-im` dependency/Bundle; configure its Profile Patch with `discord.consumerMode: external-consumer` before connection. Run the existing dev-instance helper without `--im-provider` (that flag intentionally selects the earlier qualified product Provider). Verify the installed candidate runtime digest rather than calling it qualified.
2. Keep token in the machine-local DSH credentials service. Bind the inspected Bot identity to the dedicated PersonaBot through existing Human UI/Host commands, register the exact guild text-channel target and authorize its receive scope. Enable mention reception.
3. In the text channel, select the native Bot mention and request a short exact reply. Inspect the canonical Source Event/Admission, observed model turn, own-identity original-channel native receipt and no DM mirror.
4. Create a public thread as the Human first. Mention the Bot inside it. Confirm native reply destination is the existing child channel and parent conversation remains the authorized text channel.
5. Before full qualification, exercise the remaining live refusal/lifecycle matrix: wrong identity/route, lost native permission/source, stale/revoked Grant, competing/lost consumer, redelivery, pause/resume and restart. Controlled tests cover contract refusals but do not substitute for these real-platform checks.

## Validation boundary

Provider full suite: 3,567 passing tests, build and package verifier passed. BotHarness full suite: 2,470 passing tests, 9 skipped; lint, formatting, typecheck, build and release-ledger validation passed. Focused Core tests distinguish assembled fixtures from this real model/native E2E.

History/context reads, files, ordinary collection, global defaults, shared Channel placement, autonomous thread following and proactive canonical posting remain unqualified. Human UI acceptance, remaining live negative/lifecycle matrix and CI on the published PR remain pending. No merge or deployment is authorized by this checkpoint.
