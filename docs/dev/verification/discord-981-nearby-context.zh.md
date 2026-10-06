# Discord nearby 上下文候选 — #981

这是已验收 #937 后的独立开发源切片。真实原生 nearby 正向续页仍等待操作时的权限授权；产品 Provider pin、普通收件和 history／nearby／topic 组合行资格保持不变。

## 运行版本与检查

- Core：`74cb0678752c6e48aefd3450186a92a8c12df39e`，基于已合并 main `632e79821e9f8d6cde996134a4986065cbb08ef2`。
- 隔离 Provider：`5ae8bb3b1b0bb4067bf240e0dfb6fbe38d582c32`；已加载 `lib/index.js` 的 SHA-256 为 `a59c18c5323cc2852f43f88187237fcc6e997e520520fb18bc0c47151816221b`，与候选产物相同。
- DSH `0.2.0-rc.1`；真实 Session 请求为 DeepSeek Pro／off。同一持久 QA Profile 保留 #937 的原 Binding／Grant、原生 App／频道／已有公开 thread。
- Provider 构建、3,594 个完整测试及包检查通过，覆盖密集／稀疏／边界／计数／遗漏／快照／cursor／过期／重启／取消。Host lint、格式、类型、104 个上下文／canonical 回归、完整 2,740 个测试（9 个跳过）、构建、双语账本及 366 页文档通过。这些是本机检查；托管 CI 由 PR 独立记录。

## 查询行为

`bridge_context(nearby)` 读取来源所在的准确原生频道或公开 thread。通过每页有界、从新到旧的原生请求组装前后五分钟窗口；两侧稀疏时，补足最接近窗口的可见 Human 文本到请求的最小条数（默认前 10／后 5），锚点独立计数。密集窗口不受这些最小值截断；历史耗尽时允许少于最小条数，不等待未来消息。

续页保留签名、无正文的进程内状态和固定快照上限，每次成功读取续期 30 分钟。每次均重检原生账号、父子关系、正文／历史权限和既有 Host 授权；重启或查询／身份变化使旧 cursor 失效。Bot／webhook／系统／不支持文本如实计入遗漏。既有 canonical 对账／审计拥有留存上下文，不增加第二份记录、普通 Admission、placement、监听器或 Session。

[Discord 原生契约](https://docs.discord.com/developers/resources/message#get-channel-messages) 规定从新到旧的页和互斥的 before／after／around 边界。当前实现提供更窄的有界 nearby 组装，不是全平台搜索或完整归档。

## 已通过拒绝路径与稳定冷启动

原生 App flags 为 `0` 时，真实浏览器提及触发真实模型 `bridge_context`，参数为 nearby、before_count 10、after_count 5。实际结果为 `Error: history-permission-denied`；一次 `bridge_reply` 获得 provider-accepted，独立原生读回确认本 Bot 在原公开 thread 回复 `DISCORD-981-NEARBY-OFF:history-permission-denied`，引用这条新 Human 来源。来源审计为 nearby／refused，无历史 source ID。原有所有 canonical 行保持字节相同；仅新增本次提及的 Source Event、Admission 和一次回复 Intent。Binding／Grant／placement 不变。

首次运行最新 main 新增一次 Memory-change Source Event 和 Admission，无外部来源或回复；它单独记录，不能称为全表不变的重启。初始化结束后的第二次冷启动，六张 canonical 表全部字节相同。OFF 验收后的累计数量：1 Binding／1 Grant／23 Source Events／6 Admissions／4 Outbox replies／2 placements，包含此前 DM 和 Memory 初始化。

![真实 nearby OFF 拒绝](../../assets/pr/981-discord-nearby/nearby-off-model-native.jpg)

[模型／原生／canonical 证明](../../assets/pr/981-discord-nearby/nearby-off-proof.json) · [稳定冷启动证明](../../assets/pr/981-discord-nearby/cold-restart-proof.json)

## 剩余验收

代理直接进行的真实模型 nearby 正向读取、续页、原位置回复及精确恢复 Message Content 仍待完成。此前 #937 的授权窗口已恢复 OFF，新的原生正文可见性需要操作时授权。不增加人工 QA 等待，也不据此授权产品提升、发布或部署。
