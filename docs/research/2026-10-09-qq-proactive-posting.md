# QQ 群主动发送：当前官方契约、开源实现与 #1204 的下一步

核查日期：2026-10-09（Asia/Tokyo）。范围是普通 QQ 群的 source-free 主动消息，不是 QQ 频道，也不是单聊流式回复。仅读取公开文档、固定版本源码和本地 Provider 代码；没有修改平台权限、扫描二维码或发送 QQ 消息。本文补充 [QQ 群聊规格 #1149](https://github.com/BotHarness/DeepSeekBot/issues/1149)，不是实机通过声明。

## 结论

**当前官方在线文档仍明确记录群主动发送；#1204 已采用正确的 source-free 请求形状。现阶段最该核实的是目标群的机器人通知权限，而不是改用流式接口或再重试同一条请求。** 群发送页列出 `40034105` 为主动发送无权限，要求检查机器人权限设置。官方事件页进一步给出了具体操作位置：群管理员在机器人资料页开启／关闭通知会产生 `GROUP_MSG_RECEIVE`／`GROUP_MSG_REJECT`。[群发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)、[开启通知事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_msg_receive.html)、[关闭通知事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_msg_reject.html)

SDK **1.0.4 已有 rawEvent 生命周期入口**，但当前维护 fork 与现代 dsh-im 上游的 QQ Runtime 都未订阅这两个通知事件。这是能够改善当前资格诊断的具体缺口；收到开启事件仍只是某时点的权限线索，不能代替随后那次原生发送结果和群内可见确认。[官方 SDK 事件派发](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/protocol/gateway/event-dispatcher.ts#L271-L274)、[上游 Runtime](https://github.com/xmanrui/dsh-im/blob/bbafc9991db4537f3b2068b0fea14c86a8fe247a/src/channels/qq/qq-runtime.mjs#L256-L259)

## 1. “latest”的可证明范围

本轮 `web` 工具不能打开 `bot.q.qq.com` autogen 页面；随后通过公开 HTTPS GET 成功读取其实际 HTML，核对页面标题、正文和页脚，未使用搜索摘要替代正文。下列时间是页面自报的最后更新时间，不是本项目认定的功能发布时间。

| 第一方页面／项目                                                                                                                                                                            | 本轮读取的版本或自报更新时间                    | 可证明内容                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| [群发送接口](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)                                                                                | 2026-09-03 17:58:33                             | 群主动频控、被动窗口、请求字段和错误码                           |
| [消息概述](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html)                                                                                                     | 2026-07-21 23:01:44                             | 客户端允许主动发送开关、主动／被动／召回分类                     |
| [GROUP_MSG_RECEIVE](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_msg_receive.html) / [REJECT](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_msg_reject.html) | 均为 2026-07-21 16:27:59                        | 群管理员资料页通知开关事件                                       |
| [官方变更记录](https://bot.q.qq.com/wiki/develop/api-v2/changelog.html)                                                                                                                     | 最新条目及页脚 2026-09-16                       | 2026-08-10 统一调用域名为 `api.bot.qq.com`；未列出撤销群主动发送 |
| [qqbot-nodejs](https://github.com/tencent-connect/qqbot-nodejs/commit/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3)                                                                             | main `ca55d9c…`，提交 2026-07-31；package 1.0.4 | 原生主动发送、rawEvent、双 transport                             |
| [官方 dsh-qqbot](https://github.com/tencent-connect/dsh-qqbot/commit/0c2541c38e063b1506bb1aa9b61f9cda51ecf5d9)                                                                              | main `0c2541c…`，提交 2026-09-08                | 最近消息／事件候选缓存与主动回退策略                             |
| [官方 openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot/commit/a730701d36aa7a070f98d4cba0f340f91f15e5f5)                                                                    | main `a730701…`，提交 2026-09-11                | 不带 msgId 的群主动发送实际调用                                  |
| [dsh-im 上游](https://github.com/xmanrui/dsh-im/commit/bbafc9991db4537f3b2068b0fea14c86a8fe247a)                                                                                            | main `bbafc999…`，提交 2026-10-08               | 尚有非 checked 主动原语，未处理通知生命周期                      |

仓库 HEAD 与提交日期由本轮 GitHub API 直接读取。文档存在不能证明特定 App／群已获资格；开源方法存在也不能证明某次生产投递成功。

## 2. 正确的群主动请求与边界

使用 `POST /v2/groups/{group_openid}/messages`，文本请求为 `{ "msg_type": 0, "content": "…" }`，**不携带**被动关联 `msg_id` 或 `event_id`。官方 SDK 的 `sendProactiveMessage` 构造相同类型的消息体；`sendText({scope:'group',targetId}, text)` 也是这条路径。`group_openid` 属于具体 QQ 应用，不是群号码，也不能跨应用借用。[SDK 主动发送](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/protocol/api/messages.ts#L88-L101)、[消息体](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/protocol/api/messages.ts#L340-L342)、[官方唯一身份说明](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/api-call-guide.html)

群主动频控为认证 Bot 60/qpm、未认证 30/qpm；每个目标群 20/qpm、1000 条／日。接口另列 100 QPS，不能用它覆盖细分主动预算。群被动回复依旧 5 分钟、每条 5 次；`event_id` 只适用于页面明确列出的事件。显示引用的 `message_reference` 不能延长回复授权。[群发送契约](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)

单聊 `/stream_messages` 不提供群主动发送替代路线：当前群页明确不支持流式；SDK 也检查 scope 必须为 C2C 且具有入站 msgId。概述的 `is_wakeup` 互动召回属于单聊规则，当前群发送请求表没有此字段，不能直接拿来解锁群主动发送。[单聊 stream](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_stream_messages.post.html)、[SDK 强制边界](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/QQBot.ts#L908-L921)、[召回分类](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html)

## 3. 权限事件能提供什么证据

`GROUP_MSG_RECEIVE`／`GROUP_MSG_REJECT` 使用 `GROUP_AND_C2C_EVENT (1<<25)`，事件体包含 Unix 秒 `timestamp`、`group_openid`、操作人的 `op_member_openid`。官方定义是管理员在机器人资料页开启／关闭通知，**不是** `GROUP_MESSAGE_CREATE` 全量消息开关，也不是 Bot 消息成功回声。[开启](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_msg_receive.html)、[关闭](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_msg_reject.html)、[全量消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html)

未找到第一方 `GROUP_MSG_PROACTIVE` 事件定义：官方 SDK 常量仅列上述 RECEIVE／REJECT，直接请求猜测的 `group_msg_proactive.html` 虽返回 HTTP 200，正文却是“启动接入”，不能算事件存在。不要创造此事件或依据一次 200 判断文档路径有效。[固定 SDK 常量](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/protocol/gateway/constants.ts#L80-L88)

`REJECT` 可支持显示“平台通知已关闭”并停止无效重试；`RECEIVE` 可支持显示“已观察到管理员开启通知，可重新核验”，但不能自动授予 BotHarness 的主动发送 Grant。缺少事件、重连或历史开启记录均不能推导当前允许。最终原生 API 仍独立执行群成员、禁言、下线、权限和额度检查。[群错误码表](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)

当前页面没有提供明确的主动能力申请审核入口、剩余额度查询或无副作用资格探测接口。认证状态仅参与文档中的频控分档；不能将“个人认证”当作某群通知权限已经开启的证明。`40034105` 能证明当次主动请求被权限拒绝，不能单凭此码区分所有后台资格与群开关原因，也不能推出全平台永久关闭。

## 4. 开源实现：可以复用的机制与不能继承的行为

### 官方 SDK 与本地已安装版本

官方 `QQBot` 声明 `rawEvent` 回调，Gateway 将非消息／非交互事件转交它。[接口](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/QQBot.ts#L192-L230)、[回调](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/QQBot.ts#L546-L554)、[派发末尾](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/protocol/gateway/event-dispatcher.ts#L267-L274)

独立检查 `reference/dsh-im-1154-proactive/node_modules/@tencent-connect/qqbot-nodejs`，package 确为 **1.0.4**：`src/QQBot.ts:538–540` 和实际可执行的 `dist/QQBot.js:300` 都会发出 rawEvent；Gateway 源码 `:240–242` 转交 raw 数据。已安装 dispatcher、constants、messages 三个源文件与官方 `ca55d9c…` 对应文件字节相同；QQBot façade 文件字节不同，故没有把整个 npm 包宣称为 GitHub HEAD 的完全相同制品。这项检查证明已有 hook 可用，不证明当前 QA Host 已处理事件。

官方 SDK 同时存在 WebSocket（默认）和 Webhook transport，通知事件与发送 API 不要求新增独立连接。官方旧 botgo README 的 WS 下线预告与当前源码能力存在版本差异；无需为解决 `40034105` 直接重写 transport。[当前 transport 选项](https://github.com/tencent-connect/qqbot-nodejs/blob/ca55d9c395b582b7fcfad0ec27209c35dd04e0b3/src/QQBot.ts#L151-L177)、[旧预告](https://github.com/tencent-connect/botgo#注意事项)

### 官方 DSH 与 OpenClaw 插件

`openclaw-qqbot` 的主动模块实际调用 `bot.sendText(target,text)`，target 不带 msgId；这支持当前发送形状，不包含替目标群开通平台权限的机制。[实现](https://github.com/tencent-connect/openclaw-qqbot/blob/a730701d36aa7a070f98d4cba0f340f91f15e5f5/src/features/proactive.ts#L299-L348)

`dsh-qqbot` 则先寻找显式或缓存的未过期 msg／event 候选，全部不可用才删去关联成为主动消息。该策略可解释一些项目“长任务仍能回复”的表象：它可能使用同一会话其他新消息的被动窗口，未必是真正主动成功。BotHarness #1154 不应照搬：不能把其他 Source 借给当前任务、把被动失败静默转主动，或把 unknown 再发一次。[三级目标选择](https://github.com/tencent-connect/dsh-qqbot/blob/0c2541c38e063b1506bb1aa9b61f9cda51ecf5d9/src/transport/reply-target.ts#L1-L45)

社区项目维护者也有“群机器人管理中开启权限后测试正常”的具体报告，但这只证明该维护者的环境；不能覆盖本 QA 应用或官方最新契约。它与“2025 年后所有群主动消息一律拒绝”的 issue 作者说法相冲突，必须分开对待。[原 issue 与维护者回复，2026-08-23／24](https://github.com/HuHoBot/PenguinAgent/issues/1)

### 当前 dsh-im 和 #1204

维护 fork `39b207c3…` 的 `external-post.mjs` 使用 source-free 文本体，令牌及应用校验后再次执行本地授权 fence，分类 native 权限／频控／unknown；不需要为了省略 msg_id 再换一个 sender。[checked POST](https://github.com/DoodleBears/dsh-im/blob/39b207c3f5febc8536a4f1acf8a59033c5e93a77/src/channels/qq/external-post.mjs#L5-L50)

现代上游 `bbafc999…` 仍有非 checked `sendProactiveText` 原语，但 Runtime 仅订阅 ready/resumed/error/message；维护 fork `39b207c3…` 也只有这四类监听，尚无 rawEvent／通知状态诊断。[上游发送](https://github.com/xmanrui/dsh-im/blob/bbafc9991db4537f3b2068b0fea14c86a8fe247a/src/channels/qq/qq-runtime.mjs#L117-L138)、[上游监听](https://github.com/xmanrui/dsh-im/blob/bbafc9991db4537f3b2068b0fea14c86a8fe247a/src/channels/qq/qq-runtime.mjs#L256-L259)、[fork 监听](https://github.com/DoodleBears/dsh-im/blob/39b207c3f5febc8536a4f1acf8a59033c5e93a77/src/channels/qq/qq-runtime.mjs#L450-L453)

## 5. 对 #1204 的具体推进顺序

1. 在当前 QQ 群的**机器人资料页／群机器人管理**只读核实通知／允许主动发送状态，记录实际文案。官方开发者网页没有看到开关不能证明客户端也没有。若需要修改，由 Human 明确授权并操作该群的开关；不代替改变应用访问范围。
2. 在既有 QQ Runtime 的 SDK 生命周期内补充有界 rawEvent 诊断候选；核对当前账户、group、时间和 lease，不创建新 Source、不记录操作人明文 OpenID、不凭 RECEIVE 自动增加产品 Grant。实现前沿用该 issue 的正式测试边界与 claim，不能把本文当成已写好的 Provider 契约。
3. 只有目标权限出现可验证变化后，才从真实 Client 经同一 checked Provider 发一次清晰标识的主动验收文本：不传 msg_id/event_id、不复用其他消息的窗口、不重试。保留原生结果，并由 Human 在原群确认可见。没有权限变化时重复相同 POST 不会增加资格证据。
4. `40034105` 保持当次权限拒绝；`40034100` 保持频控；丢回执／超时保留 unknown，禁止换 sender 补发。成功只证明当次 app/group/text，之后还要完成共享 #1115 与 #1154 的超时任务完整闭环，不能用一个手动成功替代整张票据验收。

这些是下一步实施与实机验收建议，**本轮没有执行**。

## 6. 历史冲突材料

腾讯 `bot-docs` GitHub 旧文档仍写 2025-04-21 停止主动推送和每月 4 条；当前在线群发送页及概述都采用另一套主动规则。这是可复现的第一方版本冲突。面对本次 2026-10-09 调研，优先使用有当前页脚时间的在线契约及实际 native 结果，不能再断言“主动消息全球停止”，也不能以新文档反推 QA 已有权限。[旧仓库公告](https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/server-inter/message/send-receive/send.md)、[当前在线契约](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)
