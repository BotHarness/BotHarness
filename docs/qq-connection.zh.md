# 将 Bot 接入 QQ 群

使用**通过腾讯官方平台授权的 QQ Bot 应用**。这条路径把 PersonaBot 接到已经加入 QQ 群的应用。先用一个应用、一个 Bot 和专用测试群验证。

这是 [#1152](https://github.com/BotHarness/BotHarness/issues/1152) 的开发切片，需要 `scripts/dev-im-provider.mjs` 选择的已取得资格的 Provider；任意 dsh-im 安装版本不一定提供所需 checked 契约。公开发布与其余 [QQ 能力](https://github.com/BotHarness/BotHarness/issues/1149) 各自记录交付状态。

## 接入并绑定应用

1. 在 [QQ 机器人官方平台](https://bot.q.qq.com/open) 创建应用，遵循平台当前的应用资格和入群要求，把应用加入测试群。
2. 确认 PersonaBot 能使用选定模型回复本机私聊。
3. 打开 **设置 → IM 机器人 → QQ → 扫码接入**，完成腾讯对该应用的官方授权。凭据由 Provider 的凭据服务保存。
4. 打开 Bot 私聊，在 **Channel sidebar → 外部身份 → 绑定应用** 选择 QQ 应用并绑定。就绪状态表示群提及可以进入这个 Bot 的收件箱；无需保存发送目标或逐群授权。
5. 在 QQ 群里 @ 应用发送简短文字问题。检查 **Bot 收件箱**、打开来源，并在原 QQ 群核对答复。

一个应用属于一个 Bot。Bot 使用收到消息的应用身份回复。平台的可用范围和群成员设置决定谁能联系该应用。

## 理解首个切片

| 行为           | 当前契约                                       |
| -------------- | ---------------------------------------------- |
| 入站           | 可信 `GROUP_AT_MESSAGE_CREATE` 事件中的文字    |
| 目的地         | 同一应用范围内的原 QQ 群                       |
| 回复           | 关联原消息的原生文字答复                       |
| 回执           | QQ 返回的原生消息 ID，表示平台接收             |
| 暂停或解绑     | 停止新入站并阻止尚未发送的答复                 |
| 重复事件       | 复用 canonical Source Event 与 Inbox Admission |
| 发送结果不确定 | 保留 unknown，不自动重发                       |

[官方群发送契约](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html) 规定被动答复有五分钟窗口，每条来源消息最多回复五次。Bot 不会把过期答复自动改成主动发送。平台回执不代表 Human 已收到或已读。

首片不接收 QQ 私聊、普通群消息、附件或复合／引用载荷。[普通群事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html) 还需要应用开启接收所有消息；显式开启该能力另有切片。图片、文件、语音接收和延迟主动报告依次跟进。

QQ 没有向这个 consumer 提供群历史接口或持久恢复游标，断线可能留下空缺。Host 重启后，已保存来源仍可查看，但进程内回复证明不可用，直到平台再次投递符合条件的原生事件。旧来源不能变成发送无关新消息的权限。

## 应用未出现或无法回复

- 在 **设置 → IM 机器人 → QQ** 检查连接。接收器在线和应用身份验证都需要通过。
- 展开该应用的**诊断详情**，安全的 HTTP 状态、平台错误码和资格提示有助于区分凭据、权限和响应问题。不要分享凭据或授权二维码。
- 来源过期时，在 QQ 发送新的 @ 提及。发送结果不确定时，先到原群核对，再请求另一条消息。
- 检查 Bot、绑定和会话是否启用并允许。暂停、屏蔽和解绑会撤销尚未发送的权限。

[Provider 接入指南](dev/guides/im-provider-integration.md) 与 [ADR-0144](adr/0144-qq-group-replies-use-authenticated-apps-and-process-local-source-proof.md) 记录实现边界。
