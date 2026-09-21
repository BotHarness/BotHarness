# dsh-im × BotHarness 外部 IM 接入策略

| 项目        | 内容                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 调研日期    | 2026-09-21                                                                                                                                                                                              |
| dsh-im 快照 | [`42776b5`](https://github.com/xmanrui/dsh-im/tree/42776b5beb4b304afbca0c8703d647cb59614df0)，`package.json` 版本 `4.24.0`                                                                              |
| 问题        | BotHarness 应直接把 dsh-im Bot 绑定到 PersonaBot，还是采用 Letta 风格 Connections？                                                                                                                     |
| 方法        | 逐文件阅读 dsh-im 的 Host/Client Plugin、公开 Service、入站 Session 路径、配置/凭据/投递存储与官方使用文档；再与 BotHarness `CONTEXT.md`、living architecture、ADR-0001/0011 及 Letta Channels 调研对照 |

## Executive recommendation

**不是二选一。推荐“Letta 风格控制面 + dsh-im transport/provider 实现”的分层组合。**

- BotHarness 持有 application-defined **Bridge Connection、Binding、Channel、Source Event、Bot Inbox、Reply Route 与 Outbox authority**。
- dsh-im 作为独立 DSH **Plugin/Fiber** 持有平台连接、SDK、重连、平台原生呈现与账号健康；BotHarness 通过稳定 **Service Definition → Provider** 消费能力。
- 当前即可直接消费 dsh-im 的 `dshIm` Host Service 做“已保存目标的主动纯文本发送”，并可选择消费 `dshImClient` 嵌入完整管理面板。
- 当前**不能**把 dsh-im 当成 BotHarness 的完整入站 Provider：dsh-im 的公开 `dshIm` Service 没有 inbound subscription；收到消息后，它会自己按 conversation key 创建/绑定 DSH Session，并直接 `ask()`。这绕过 Source Event → Channel → Inbox Admission → Bot Inbox → Orchestrator。
- 因此 v1.1 的完整双向 Bridge 需要 dsh-im 上游增加一个**独占 consumer / provider mode**，或提供等价稳定 seam：交出 authenticated inbound evidence，且在该账号被 BotHarness 接管时禁用 dsh-im 原生 Session 驱动。不要读取 dsh-im 私有 JSON、import 未导出的内部模块或 fork 整包来伪造 seam。

换句话说：**Letta Connections 是控制面/资源模型参考，dsh-im 是数据面实现；两者职责不同。**

## 已确认事实

### 1. dsh-im 已经是成熟的多渠道 DSH Plugin，而不只是 SDK 包装

Host Plugin 同时启动各渠道，并注入 `connection`、`credentials`、`typertGateway`；渠道生产实例拥有连接 supervisor、配置/状态存储、Harness client、workspace/session 协调、access policy 和 delivery adapter。每个渠道通过 Cordis effect 清理连接，delivery adapter 的 Registration 也在关闭时撤销。

这意味着直接安装 dsh-im 可以复用：

- 多账号 Bot onboarding、连接测试、重连与 health；
- Feishu/Lark、Slack、Discord 等平台 SDK/协议细节；
- DSH credentials 使用、非秘密配置投影；
- 消息/文件/卡片/交互的渠道原生呈现；
- 已有设置 UI 与多 Bot 管理；
- 现有 conversation route、workspace 与 DSH Session 处理。

最后一项对独立 dsh-im 很有价值，但正是它与 BotHarness execution model 冲突的地方。

### 2. 当前公开 Host Service 只覆盖主动投递

`plugin-src/host/index.mjs` 通过 `ctx.provide('dshIm', …)` 暴露：

```ts
interface DshImHost {
  send(
    botId: string,
    targetId: string,
    text: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ sent: true }>;
  listTargets(botId: string): Promise<DeliveryTarget[]>;
  listBots(): Promise<Array<{ botId: string; channel: string }>>;
}
```

`botId + targetId` 是稳定调用标识；目标把 provider-native route 保存在 dsh-im 的 workspace store 中。当前投递只承诺平台 API 接受或 SDK 成功返回：不保存投递历史、没有 `deliveryHandle`/`idempotencyKey`、不自动重试，超时重试可能重复，公开成功结果没有 provider message id。

所以它适合成为 BotHarness **Provider Operation** 的第一版执行器，但不能替代 BotHarness 的 Outbox Intent、attempt、receipt/unknown-outcome 与授权。

删除并重新接入 dsh-im Bot 会清理原 targets，调用方需要重新复制 `botId` 并配置目标。BotHarness 发现 opaque reference 失效时必须把 Bridge Connection 标为 `degraded / rebind-required`，不能按显示名、App ID 或“最近 Bot”静默重绑。dsh-im 另有无鉴权的 Host HTTP 投递端点；BotHarness 不需要它，只消费 same-Host Cordis Service。

### 3. 当前公开 Client Service 只覆盖管理面板嵌入

`dshImClient` v1 提供 `render()`、`setSettingsVisible()`、`settingsVisible()`。宿主可以嵌入完整 IM 管理面板；原设置入口仍默认保留。它不注册 BotHarness/桌面私有 sidebar slot，也不改变 Host 权限。

该面板适合作为 v1.1 的 **Provider Setup / Advanced** 入口，但不能成为 PersonaBot Binding 的 authority：

- 面板包含 dsh-im 自己的 workspace、model、Agent Preset、Session 与 target 管理；
- V1 只面向一个活跃管理面板，不同步多个嵌入副本；
- 它没有 PersonaBot/Channel/Inbox/Grant 语义。

BotHarness 应提供自己的 Bridge Connection 与 Binding UI；只有在替代入口和内容都可访问后，才隐藏 dsh-im 原设置入口。

### 4. 入站消息当前直接落到 dsh-im 自有 Session mapping

共享 `text-harness-bridge.mjs` 对 provider message id 去重后，计算 `conversationKey`，最终调用 `askInWorkspaceSession()`。`workspace-session.mjs` 会：

1. 从 dsh-im state 读取 `state.sessionFor(conversationKey)`；
2. 不存在时直接 `harness.createSession({ conversationKey })`；
3. 用 `state.setSession(conversationKey, sessionId)` 持久化映射；
4. 直接调用该 Session 的 `ask()`；
5. 把答案经当前渠道 reply target 发回。

dsh-im 的 `/new`、`/session`、`/conv`、workspace/model/preset 命令同样围绕这份 mapping 工作。它没有公开 authenticated inbound event subscription，也没有“只 transport、不驱动 Harness”的账号模式。

这与 BotHarness 的权威链冲突：PersonaBot 的外部消息必须先成为 immutable Source Event，再经 Channel/Admission 进入 Bot Inbox，由唯一 Orchestrator Session 决定回复或 Assignment。一个 external conversation 也不等于一个 DSH Session。

### 5. dsh-im 自己拥有多份非秘密运行配置和路由状态

以 Feishu 为例，生产路径在 `$DSH_HOME/integrations/dsh-feishu/` 下持有 `config.json`、`workspaces.json` 和 per-bot `state.json`：

- `config.json` 保存 bot id、app id、secret ref、owner、domain 与行为设置；
- `workspaces.json` 保存 workspace、conversation workspace、access policy、delivery targets 与 session sync；
- `state.json` 保存 conversation → Session 等运行映射。

Feishu App Secret 正确进入 DSH credential provider，不写这些文件；这是值得保留的安全实践。但这些 JSON 仍是 dsh-im 产品自己的 routing/session authority。BotHarness 不应再次把它们读成 PersonaBot Binding 或 Messaging authority；ADR-0011 中“读取 base stores 识别 Bot”的旧耦合应只视为迁移期兼容路径，不能扩展成 v1.1 主链。

### 6. 包兼容性需要单独验证

本次快照的 package compatibility 列表只明确写到 DSH `0.1.5-alpha.1`；BotHarness 本地开发基线是 `0.1.5-rc.2`，技能验证还覆盖 `0.1.6-alpha.2`。这不等于已知不兼容，但意味着安装前必须做真实 Profile smoke test，不能把 README 的旧兼容声明当作当前 Host/Client/API Gateway 事实。

## 三个方案比较

| 方案                                              | 优点                                                             | 主要问题                                                                                                                             | 结论                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| A. 直接把 dsh-im Bot/Session 绑定为 PersonaBot    | 最快得到多渠道、UI、回复与平台交互                               | dsh-im 直接拥有 conversation→Session、workspace、access、target 与 reply；绕过 Source Event/Bot Inbox/Orchestrator，形成双 authority | **不作为 canonical v1.1**；只允许 legacy/diagnostic mode |
| B. 完全照 Letta 重做 Connections + adapters       | 模型干净、PersonaBot 原生                                        | 重建 dsh-im 已有 SDK、onboarding、重连、UI、渠道呈现，成本与风险最高                                                                 | **不做**；Letta 只作分层参考                             |
| C. BotHarness 控制面 + dsh-im provider/data plane | 最大复用平台能力，同时保住 PersonaBot execution 与 durable facts | 需要补 inbound ownership seam，并验证版本兼容                                                                                        | **推荐**                                                 |

## 推荐架构

```text
dsh-im Plugin/Fiber
  platform SDK / listener / reconnect / native presentation
            │
            │ exclusive authenticated inbound consumer + provider operations
            ▼
BotHarness Messaging Provider Registration
            │
            ├─ Bridge Connection (provider account/config/health)
            ├─ Binding (external scope → PersonaBot + Channel + policy)
            └─ Messaging Ingress transaction
                 Source Event → Channel → Inbox Admission → Bot Inbox
                                                        │
                                                        ▼
                                             Orchestrator Session
                                                        │
                    Reply/Service Action → Outbox Intent│
                                                        ▼
                                      dsh-im provider operation → platform
```

### BotHarness owns

- **Bridge Connection**：provider/account identity、credential reference、health/capability snapshot；
- **Binding**：`Bridge Connection + external scope selector → PersonaBot + Channel + policies`；
- Source Event、Revision、Channel placement、Inbox Admission/Attention；
- trusted event-scoped Reply Route；
- Outbox Intent、attempt、receipt/failure/unknown-outcome；
- Access/Wake/Delivery Policy 与 Service Grant；
- PersonaBot/Orchestrator/Assignment execution。

### dsh-im owns

- provider SDK、socket/webhook/long polling、重连与 native account session；
- verified platform identity extraction 与 provider-native route parsing；
- attachment download/upload 与渠道原生 presentation；
- 平台 capability/health；
- credential material 的 Host-side resolution（通过 DSH credentials）。

### 必须向 dsh-im 补的稳定 seam

优先上游贡献，而不是 import `src/**`：

1. **Exclusive inbound consumer Registration**：按 provider account 获得唯一处理权；Registration 随 consumer Fiber dispose 撤销。
2. **Consumer mode**：每个 Bot 显式持久化 `standalone | external-consumer`。被 BotHarness 接管后，dsh-im 不再执行 `askInWorkspaceSession()`、不创建/切换 DSH Session、不运行会改变 Session/workspace 的 IM slash commands；consumer Registration 消失时 fail closed，绝不能自动退回 standalone，否则会绕过 policy 并造成双回复。
3. **Authenticated normalized evidence**：account fingerprint、event/message id、Actor、conversation/thread/root/reply、content/attachment locators、own-sender/echo correlation、non-secret reply locator、capabilities。
4. **Durable-accept acknowledgement**：只有 BotHarness ingress transaction commit 后才 ack；若 provider 可 replay/resume，暴露 cursor/sequence；否则 health 明示 gap 风险。
5. **Reply operation**：能对可信 reply locator 发送，而不是要求先把每个入站 route 人工保存成 `targetId`。
6. **Operation outcome**：尽可能返回 provider message id/receipt；超时必须能表达 unknown outcome；provider 支持时暴露幂等或 outcome lookup。

如果上游接受设计但正式版本尚未发布，只有在新增 ADR 明确退出条件后，才可用固定 upstream commit 的**临时最小 fork**验证 TB1：只在进入现有 Harness bridge 前增加 exclusive consumer branch，并暴露 ingress/reply facade，不修改渠道 SDK、连接、重连或 native presentation；用 facade contract、standalone parity、lifecycle 与 duplicate tests 保护。上游若拒绝这类 seam，则改为 BotHarness 自己实现 Feishu/Lark Provider Plugin并复用其设计/测试经验。无论哪条路径，都不要让同一 app/bot credential 同时启动两个 listener，不使用长期 deep import 或大型复制式 fork。

## “PersonaBot 可以发消息”的近期可交付切片

这件事比完整入站 Bridge 更窄，可以先做：

### TB0：只出站的 dsh-im Provider Operation

1. Profile pin 并安装已验证版本的 dsh-im。
2. BotHarness 新增 optional consumer Plugin，`inject: ['dshIm']`；探测 service/version/capabilities，缺失时明确 unavailable。
3. Human 在 dsh-im 面板完成 provider Bot 与 `targetId` 测试；BotHarness 保存的 Bridge Connection 只引用 `providerBotId + targetId`，不复制 secret/native route。
4. Human 把该 target 绑定到一个 PersonaBot，并授予 proactive messaging Service Grant。
5. PersonaBot 发起 Service Action；Host 先写 Outbox Intent，accept 与 execute 时各校验 archive state、Binding、Grant 与 capability，再调用 `ctx.dshIm.send()`。
6. `{ sent: true }` 只记录为“provider accepted”，不记为 delivered/read；timeout 记 unknown-outcome，不自动盲重试。

TB0 证明“Bot 可以主动发消息”，但它**不是双向 Channel 完成态**，也不能用来回复尚未保存为 dsh-im target 的新入站消息。

### TB1：Feishu/Lark DM 双向 Bridge

在 exclusive inbound consumer seam 可用后，走真实：

```text
Feishu/Lark DM → dsh-im listener → BotHarness durable ingress
→ PersonaBot Bot Inbox → Orchestrator → Outbox Intent
→ trusted reply operation → same DM
```

验收必须包含 duplicate/restart、未授权 sender、错误 PersonaBot binding、provider dispose、credential rotation 与 Human 真实客户端路径。

### TB2：Slack 或 Discord second-provider proof

只增加 Registration/config/capability fixtures，不改 Messaging tables/主链；验证 thread route 不串线。通过后才证明 core 真正 provider-neutral。

## Issue/ADR implications

- 保留 ADR-0001“dsh-im 作为 base plugin”与 ADR-0011“独立 Plugin、不 fork”结论。
- 修正 ADR-0011 的历史性实现假设：不再把读取 dsh-im private stores 作为 v1.1 稳定边界；新增 upstream Service seam 或独立 Provider Plugin。
- #46 继续拥有 Messaging deep module、Provider Registry、Ingress 与 Outbox authority。
- #48 应明确 dsh-im 是首选 transport provider，并把 TB0 与 inbound seam gate 写入 scope。
- #78 继续用 Feishu/Lark 官方文档和 sandbox evidence定义 provider contract；dsh-im 源码只能证明现有实现行为，不能替代平台官方能力事实。

## Adoption checklist

- [ ] 在 BotHarness pin 的 DSH `0.1.5-rc.2` Profile 安装 dsh-im 并验证 Host start/stop、`dshIm`、`dshImClient`、Typert/API Gateway 与 UI。
- [ ] 明确 dsh-im package version、DSH version 与 upstream commit；升级有 contract/smoke tests。
- [ ] TB0 不读取 dsh-im JSON、不 import private `src/**`、不复制 credential/native route。
- [ ] PersonaBot Binding 只由 BotHarness command/deep module 修改；dsh-im settings 不自动改变 Binding。
- [ ] Outbox 对 dsh-im 当前 `{ sent: true }` 使用 accepted 语义，并覆盖 abort/timeout/duplicate risk。
- [ ] 设计并向上游提交 exclusive inbound consumer/provider-mode proposal；未落地前不宣称双向 Bridge。
- [ ] dsh-im Bot 删除/重建或 target 丢失时标记 `rebind-required`，不按名称/App ID 猜测新绑定。
- [ ] 一个 provider account 只有一个 listener owner；native dsh-im session mode 与 BotHarness consumer mode 不能并行。
- [ ] Provider Fiber dispose 后 inbound Registration、connection 与 operations 一起失效；其他 provider 不受影响。
- [ ] credential secret 只在 Host 由 DSH credentials resolve，不进 botharness.db、RPC、日志或 Client。
- [ ] 第二 provider 不引入 core provider branch 或第二份 routing/session authority。

## Sources

- [dsh-im Host Plugin / `dshIm` Service](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/index.mjs)
- [dsh-im Delivery Service](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/delivery-service.mjs)
- [dsh-im proactive delivery contract](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/PROACTIVE_DELIVERY.md)
- [dsh-im Client integration contract](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/docs/client-integration.md)
- [dsh-im shared inbound bridge](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/src/channels/shared/text-harness-bridge.mjs)
- [conversation → DSH Session binding](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/src/channels/shared/workspace-session.mjs)
- [Feishu production composition and local stores](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/channels/feishu/production.mjs)
- [Feishu DSH credential adapter](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/channels/feishu/credential-store.mjs)
- [shared Bot workspace/target/access store](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/src/channels/shared/bot-workspace-store.mjs)
- [dsh-im issue #65: Host proactive send Service](https://github.com/xmanrui/dsh-im/issues/65)
- [dsh-im issue #231: embeddable Client management panel](https://github.com/xmanrui/dsh-im/issues/231)
- [ADR-0001: adopt dsh-im as base plugin](../adr/0001-adopt-dsh-im-as-base-plugin.md)
- [ADR-0011: standalone plugin, not a dsh-im fork](../adr/0011-standalone-plugin-not-a-dsh-im-fork.md)
- [Letta Channels bridge research](./2026-09-21-letta-channels-external-im-bridge.md)
