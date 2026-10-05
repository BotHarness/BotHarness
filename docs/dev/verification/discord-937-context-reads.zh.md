# Discord 有界上下文读取 — 验证范围

## 候选检查点 — 2026-10-06

[#937](https://github.com/BotHarness/BotHarness/issues/937) 增加对已授权服务器文字频道及已有公开 thread 的显式有界 Human 文本读取。开发候选已通过真实模型的频道、thread 读取与原位置回复；模型续页及修复后的正文冲突实测仍等待专门授权的临时 Message Content 开启。组合的 history/nearby/topic 能力行仍未取得资格；产品 Provider pin 晋升、发布与部署另行处理。

应用定义路径为 `bridge_context` → `MessagingProvider.history` → 已注册 `historyChecked`；`bridge_read` 读取已留存的源消息本身。Provider Plugin 拥有原生身份、来源祖先关系、权限、归一化和运行时内签名 cursor；每次读取仍经过原 canonical Binding/Grant 及 Host 授权。每个原生页最多 20 条，Host 另设模型序列化字符预算，可能先返回当前原生页内的续读 cursor。Bot、webhook、系统及空正文／非文本消息计入 omitted。即使没有后续 cursor，遗漏也可能使 `incomplete` 为 true，不能声称是完整归档。

### 原生正文检查与模型路径

| 检查                                 | 实际结果                                                                                                                               | 证据边界                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Message Content OFF 时的频道普通消息 | 浏览器显示 `cobalt-37`，原生 HTTP 200 隐去正文；全部 canonical 行完全不变。                                                            | 真正未含提及的 Human 来源；被隐去的成功响应不能称为空的完整历史。                                      |
| 单独授权临时开启后的同一来源         | 原生正文可见，显式上下文读取前 canonical 记录不变。                                                                                    | 只变更原 QA App 标记，Presence/Members 保持 OFF。                                                      |
| 频道提及 → 真实模型读取 → 自身回复   | 实际 `bridge_context(group)` 返回普通消息中的 `cobalt-37`，一次 `bridge_reply` 在原来源下回复 `DISCORD-937-GROUP-OK:cobalt-37`。       | 工具调用／结果关联、canonical intent 与独立原生 Bot 回执一致；42 Admission / 37 Intent / 6 placement。 |
| 已有公开 thread                      | 普通 `iris-62` 不创建 Admission 或 intent；新提及调用 `bridge_context(thread)`，在原子频道只回复一次 `DISCORD-937-THREAD-OK:iris-62`。 | 核对原生作者、源引用及子频道位置；43 / 38 / 6。未创建新 thread 或 Session。                            |
| 原生读取器两页                       | 真正 limit-2 原生两页、略过 Bot 文本；篡改及跨路由 cursor 在更多页请求前拒绝，调用方取消亦拒绝。                                       | 直接生产 Provider 读取器使用原生 QA 账号，独立于模型翻页；canonical 行不变。                           |
| 首次真实模型续页                     | 第一页成功，第二页包含此前 #855 QA 编辑过的来源，canonical 冲突被包成通用事务失败。                                                    | 模型未误报成功、未外部回复；它显式在本机 DM 写入一条故障报告，因此新增一个普通本机 placement。         |
| 恢复 Message Content OFF             | 原生标记确认为 OFF；新真实模型调用拒绝 `history-permission-denied`，随后原位置一次回复该代码。                                         | 45 Admission / 39 Intent / 7 placement；原 Binding/Grant 及原有 placement 均保留。                     |
| 分类修复后的冷 Host 重启             | 重启前后六张 canonical 表全部行完全一致，包括已结算结果；两只 QA Bot 恢复连接。                                                        | 无自动重发或补收；新修复的正向／冲突路径仍待实测。                                                     |

![真实频道上下文与原来源回复](../../assets/pr/937-discord-context/group-context-native.jpg)

![真实公开 thread 上下文与子频道回复](../../assets/pr/937-discord-context/thread-context-native.jpg)

![恢复权限后新模型调用的拒绝](../../assets/pr/937-discord-context/content-off-refusal-native.jpg)

![已保存的 Message Content OFF 恢复](../../assets/pr/937-discord-context/message-content-restored-off.jpg)

截图来自真实浏览器，中文／深色、1230 × 820，表示不同运行时用例，不是 Client 渲染前后对比；本次没有可见 Client 代码变更。凭据和完整原生／模型日志留在私密本机文件。[频道](../../assets/pr/937-discord-context/group-e2e-proof.json)、[thread](../../assets/pr/937-discord-context/thread-e2e-proof.json)、[原生翻页](../../assets/pr/937-discord-context/native-pages-proof.json)、[恢复后拒绝](../../assets/pr/937-discord-context/off-e2e-proof.json)的精简断言区分每一层证据。

### 已编辑来源的拒绝回归

原生检查确认一条历史 QA 消息的当前正文与留存正文不同，作者及路由一致。确定性的续页回归重现通用 `Operational transaction for messaging failed`；上下文写入现改用已有 Messaging 事务边界，将 `source-conflict` 保留给调用方和拒绝审计。冲突整页回滚、旧来源不变、无新 Admission；不覆盖证据，也不静默跳过冲突的 Human 消息。相关 Core 测试 102 项通过。这修正拒绝分类，不同步远端编辑／删除。

### 不可变候选与限制

- DSH `0.2.0-rc.1`；原隔离 QA Profile、单一 checked receiver、已有 Orchestrator。
- Provider 来源 `263137fe27026ec8fa70afebc0644abcebdd6bcb`，基线 `1a605b11fa8d321110540de42d58a77bdcd60f13`；395 个运行时文件，SHA-256 `6efccd475a1dee29722aaf78829ae1feb6c6c6bcb4d88329d47f0db9116b8bc1`。Host 产物已重建，Client 产物未变；完整 Provider 测试 3,584 项通过，包验证通过。
- 正向模型路径使用 Core `53ee580d24a3a4dffe5c6503cd03311ff1053a36`，恢复权限后的拒绝使用同一构建；随后冷重启使用 `1ec6c20c3768442160c94d9ec64e8b6c9138ec3c` 冲突分类修复。完整 Core 测试 2,639 项通过／9 项跳过；lint、类型、格式、双语账本、构建与文档构建通过；最终新实测仍待完成。
- Gateway identify 仍是 `GUILDS | GUILD_MESSAGES`；App Message Content 可见性独立影响 HTTP 正文。普通收件、nearby 时间窗／最小数量、文件、新建／私有 thread、自主跟随及主动发送均不属于本 tracer。
- 原身份／Grant、产品 Provider pin、无关 QA Profile 保持不变；继续诊断前已将临时权限恢复 OFF。

原生主要依据：[Message Content 与 HTTP 限制](https://docs.discord.com/developers/events/gateway#message-content-intent)、[Get Channel Messages](https://docs.discord.com/developers/resources/message#get-channel-messages)、[Threads](https://docs.discord.com/developers/topics/threads)。参见维护中的 [IM Provider 接入指南](../guides/im-provider-integration.zh.md)和已有[提及／回复资格](discord-855-mention-reply.md)。
