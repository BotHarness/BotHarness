# Lark feedback candidate QA / Lark 反馈候选 QA

This is an exact-candidate review path for [#1040](https://github.com/BotHarness/BotHarness/issues/1040), not a release or production rollout. The task's draft PRs and window evidence below identify the paired sources. The published Provider pin remains unchanged.

这是精确候选的审阅路径，不是发布或生产部署。任务草稿 PR 与证据文件标识两端版本；已验证 Provider pin 不变。

## Prepare before the Human window / 窗口前准备

1. Check out both candidate commits in independent checkouts. Install and build BotHarness with the repository toolchain. In the Provider checkout run `npm ci --ignore-scripts`, `npm run build` and `node scripts/verify-package.mjs`. Run the focused tests listed in the evidence file. Do not substitute a same-number released Provider: the optional checked reaction contract must be present.
2. Boot a private Profile with `node scripts/dev-instance.mjs --home <isolated-home> --port <unused-port> --build`. Follow `docs/client-bridge.md` §7 and `docs/agents/ax-model.md`; retain the local login URL privately. Obtain a real native Human DM reply before claiming model usability. A health response proves only transport.
3. With that exact isolated Host stopped, add `@xmanrui/dsh-im` as a local `file:` dependency pointing at the built candidate checkout in that Profile's `package.json`, and add its Bundle to `dsh.profile.bundles`. Restart through the same helper, without `--im-provider` (which selects the separate qualified pin). Verify the installed runtime digest against the candidate using `providerRuntimeDigest` from `scripts/dev-im-provider.mjs`. This local composition is for QA only and must never become a promoted pin by accident.
4. Leave all IM accounts unconfigured/disabled. Prepare unique test markers and the table below. Request a **new Human-approved receiver window**, naming the exact app, maximum duration, competing receiver, restoration owner and verification steps. Prior #1029/#1031 windows do not authorize this task. Do not obtain shared app credentials, stop production or alter permissions beforehand.

两端独立 checkout、构建并核对候选；先用无 IM 账号的私有 Profile 验证真实 DM。候选 Provider 只通过该 Profile 的本地依赖加入，不能替换全局 pin。准备完成后才申请新窗口；旧窗口不构成本次授权。

## Operate only inside the approved window / 仅在授权窗口操作

Use the native credentials flow for the approved QA app and only one receiver. Confirm the reviewed app already has the permissions needed by the official reaction-write API, and can access the designated DM/group. If permission is missing, record it and exercise the nonblocking failure path; do not add scope without maintainer authorization. Bind only the dedicated QA PersonaBot. No approval pairing or management destination is needed for feedback.

仅使用获批 QA 应用、原生凭据流程及单一 receiver；先核对权限与指定会话，不擅自加 scope。仅绑定专用 QA Bot；无需审批配对或管理目的地。

| Case / 用例                                                                 | Canonical evidence / 权威证据                                             | Lark expectation / 外部预期                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Answerable DM and qualifying group mention / 可回答私聊与群 @               | Exact source + durable Admission; source-bound Outbox `provider-accepted` | `GLANCE`, then `DONE` on that original message; record actual appearance / 原消息先接收后回答，确认样式                          |
| Two concurrent distinct messages / 两条并发消息                             | Separate source IDs and matching Outboxes                                 | No cross-source completion / 完成不串线                                                                                          |
| Silent result or pending clarification / 静默或待澄清                       | Admission; no accepted source reply                                       | Receipt only / 仅接收                                                                                                            |
| Delegation or unrelated output / 委派或无关输出                             | No accepted reply for the original source                                 | No completion / 无完成                                                                                                           |
| Send rejected or outcome unknown / 发送失败或未知                           | Outbox `failed` or `unknown-outcome`                                      | No completion / 无完成                                                                                                           |
| Reaction denied, unavailable or source deleted / 表情拒绝、不可用或来源删除 | Attempt failure/unavailable/unknown; intake and reply still work          | No false success / 不假报成功                                                                                                    |
| Replay, reconnect and same-Profile restart / 重放、重连与重启               | Retained attempts; one canonical reply                                    | No automatic reaction resend / 不自动重发表情                                                                                    |
| Mute then block / 静音再屏蔽                                                | Silent Admission under mute; block denies new Admission                   | Mute may receipt; explicit accepted reply may complete; blocked new message has neither / 静音可接收与明确回复，屏蔽后新消息均无 |

Use the signed-in Lark web client in the Codex in-app browser for authorized message tests, following [IM browser QA (AX)](../../AGENTS.md#im-browser-qa-ax). For each source retain only sanitized IDs, Admission/Outbox/feedback states and timestamps. Capture cropped before/after Lark screenshots with the unique marker and actual reaction shapes; exclude unrelated conversations and credentials. Compare the authenticated `messagingSnapshot` with the exact original source. `accepted` means the platform accepted a request; it cannot substitute for observed rendering. Open the Lark identity editor in Web to compare the capability and recent source attempts, then refresh external identities.

逐条保存脱敏 ID、权威状态与时间；截图需显示唯一 marker、原消息及真实表情，裁掉无关会话和凭据。平台 accepted 不能代替样式截图；在 Web 的 Lark 身份编辑窗口核对能力与近期来源状态，并刷新外部身份。

## Restore and stop / 恢复并停止

Before the approved deadline, disable the QA account, unbind its identity, remove temporary account configuration/credentials through native controls and stop only the task's recorded isolated Host PID. Restore the designated original receiver only as authorized. Have the Human verify normal production Lark and Discord replies independently. Record restoration results, candidate commits and pending cases in the issue and both drafts. Leave them draft; do not merge, publish, deploy or promote the Provider pin.

到期前关闭 QA 账号、解绑、通过原生控制删除临时配置与凭据，仅停止任务记录的隔离 PID；按授权恢复原 receiver，由 Human 分别验证生产 Lark／Discord 回复。记录恢复与未完成项，保持草稿，不合并、不发布、不部署、不提升 pin。

## First window: 2026-10-09 / 首次窗口

The first authorized production-app window ran from 00:47:34 to approximately 00:54 JST, within the ten-minute limit. Both distinct DM sources committed one Admission and one corresponding `provider-accepted` reply. The app rejected all three attempted reaction writes with Lark code `99991672`; no target reactions were observed. The first source also missed its receipt attempt while the new reply connection was starting. The original runtime retained unknown results; later fixes do not rewrite or resend those attempts.

The isolated receiver stopped at 00:53:44 JST and production was restored before the deadline. Temporary QA account configuration and credentials were removed through their owning stores. Lark replies were observed after restoration, and the Human confirmed Discord was online and replied. See [sanitized window evidence](../evidence/issue-1040/lark-window-2026-10-09.json) and the [cropped failure capture](../evidence/issue-1040/lark-qa-reactions-unknown.png). SDK permission-error classification and first-connection timing have offline regression coverage; actual `GLANCE` / `DONE` appearance, group behavior and remaining cases still require permission review and a fresh authorized window.

首次窗口内两条私聊各完成一次 Admission 与对应的已接受回复，但三次表情写入均遭平台 `99991672` 权限拒绝，未观察到目标表情；首条消息还暴露连接建立期间遗漏接收尝试的问题。历史未知状态保留、不补发。QA 已提前停止，生产恢复，Lark 回复可见，Human 确认 Discord 在线且能回复；临时账号和凭据已清理。两处代码问题已有离线回归覆盖，真实表情样式、群聊及剩余用例仍待权限审查和新授权窗口。

## Authorized retest: 2026-10-09 / 授权复测

The Human authorized and added tenant-token scope `im:message.reactions:write_only`; the console showed the change published. A new guarded ten-minute window was armed at 01:42:58 JST. This retest used BotHarness `9871fd20ef4dbbafa9801d681d1e9acb96677ee2` and Provider `26e6d66d2ac3c3658d3a0faabdc154ff75af441e`, with the installed Provider runtime digest verified against its checkout. The agent sent uniquely marked messages through the signed-in Codex in-app browser.

Both `BH1040-R2-A` and `BH1040-R2-B` committed exactly one Admission and one corresponding `provider-accepted` reply, with accepted receipt and answer attempts. Their original messages visibly rendered native **Glance** and **Done** images. `BH1040-SILENT-R2` committed one Admission, rendered **Glance** only, and had no Outbox or answered attempt. Historical unknown attempts were retained without replay. See [sanitized retest facts](../evidence/issue-1040/lark-retest-2026-10-09.json) and [three original-message browser crops](../evidence/issue-1040/lark-qa-reactions-accepted.png); the crops are a window comparison, not matched baseline/after screenshots.

QA stopped early, the independent restoration timer was stopped after production recovery, and temporary account configuration and credentials were removed through native stores. A matching `BH1040-PRODUCTION-R2 OK` reply was observed in Lark after restoration; the Human confirmed normal Discord replies. Group mention, live mute/block and reconnect/restart cases, plus matched Web identity-editor light/dark captures remain pending. Both PRs stay draft; this qualification does not promote the Provider pin or deploy the candidate.

Human 已明确授权并添加最小 tenant-token 权限，控制台确认发布；01:42:58 开始的新窗口预设了自动恢复。代理直接在已登录的内置浏览器发送测试。两条不同私聊各只有一次 Admission 与对应已接受回复，原消息实际显示 Glance 和 Done；静默消息仅显示 Glance，没有 Outbox 或回答尝试。历史未知记录保留、不补发。QA 提前结束、临时账号及凭据清理、生产恢复；Lark 生产测试回复可见，Human 确认 Discord 正常回复。群 @、静音／屏蔽、重连／重启及 Web 身份编辑器明暗对照仍待验证，两份 PR 保持草稿。
