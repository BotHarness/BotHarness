# DSH 插件开发

Skill v0.3.2 · 已针对 DSH `0.1.6-alpha.2`（上游 SHA `ddefc45fbc7f8e46dd73185e68295696d1297887`）验证。DSH 仍处于开发者预览阶段：涉及关键机制时，仍应以固定版本的上游源码和实际运行的 Host 为准。

## Foundation-first 工作流

1. 完整阅读 [`references/context.zh.md`](references/context.zh.md)。使用其中的规范 DSH/Cordis 词汇命名对象和边界。只有当每个重要平台名词都对应一个明确定义，并且 application-defined 概念没有被写成 native API 时，这一步才算完成。
2. 按 [`references/decision-tree.zh.md`](references/decision-tree.zh.md) 做决策。把每个需求归类为 durable fact、command/query、runtime notification/interception、registration、projection/presentation、persistence 或 execution concern。只有当每项职责都有唯一的 primary seam，以及明确的 ownership/lifecycle 时，这一步才算完成。
3. 只加载当前需要的实现分支：
   - [`references/host.zh.md`](references/host.zh.md) — Bundle/Profile/Patch、Plugin/Fiber、Service、Tool、Event、Session、生命周期与发布。
   - [`references/client.zh.md`](references/client.zh.md) — 浏览器 Cordis 应用、Typert/API Gateway、客户端 model、构建与验证。
   - [`references/slots.zh.md`](references/slots.zh.md) — 仅在新增或修改 UI contribution 时读取。
   - [`references/community-ui-patterns.zh.md`](references/community-ui-patterns.zh.md) — 仅在选择已验证的 UI/构建方案，或检查生态版本漂移时读取。
4. 通过选定的 seam 实现，然后按需验证 install → boot → registration → exercise → unload/restart。包能够编译，不代表 Plugin 已经激活。

深层来源报告位于 `docs/research/`；`dsh_research/` 三份文档中的 DSH/Cordis 内容是基础参考的输入。下游产品自己的 Context、architecture 与 ADR 位于本 skill 之外，并拥有自己的产品词汇。

## 心智模型

- **Plugin/Fiber ownership：**Plugin 是生命周期容器；它的 Fiber 拥有 Service、listener、Registration、effect 与 child Plugin。Fiber dispose 时，其 Registration 一并撤销。
- **三层 composition：**Bundle/Profile/Patch 选择并配置 Plugin；Plugin tree 管理运行时生命周期；Registry 组合当前 live contribution。Profile 是 runtime composition，不是用户身份或 Session 隔离边界。
- **Capability seam：**`Consumer → Service Definition → Provider`。Tool 是面向模型的 Consumer，不是 Service 的同义词。
- **Visibility 与 resolution：**Agent Scope 决定哪些 Registration 可见；Service Isolation 决定一个 context subtree 解析到哪个 Service instance。两者相互独立。
- **Fact 与 notification：**SessionEvent 是 durable、可重放的事实。`session/event` 是 SessionEvent commit 后的 process-local Cordis notification。其他 Cordis Event 用于协调 live work。
- **Derived state：**Projection 把历史折叠为 read model。Session Query 是派生搜索索引。Conversation Assembly 把 event window 与 transient state 组合成 presentation node。
- **应用的两个部分：**一个包可以同时包含 Host Cordis Plugin 与独立的浏览器 Cordis Plugin。运行时值通过 Service、Event、Typert 与 Slot 跨包传递，而不是通过 value import。

## 快速 seam 检查

| 目标 | 机制 | 一侧 |
| --- | --- | --- |
| 增加 Tool | `defineTool` + `ctx.tools.register` | Host |
| 审批或拦截 Tool call | `ctx.on('tools/pre-execute', …)`（waterfall）+ `ctx.approval` / `ctx.tools.guard()` | Host |
| 向 Consumer 暴露能力 | Service Definition + Provider（`ctx.provide` 或 `Service`） | Host |
| 响应 Agent/Session 生命周期 | `ctx.on('session/event', …)`、`agent/pre-step`、`agent/status` 等 | Host |
| 向模型注入 context | `agent.inject(...)`、`agent/pre-step`、`ctx.systemPrompt.section/context` | Host |
| 持久化 Session 派生状态 | `ctx.sessionProjections.register(...)`（由 `session/event` 驱动） | Host |
| 长时或后台工作 | `ctx.jobs.start({ kind, label, owner, run })` | Host |
| Plugin 配置 / secret | `ctx.settings.installSection(...)`；`ctx.credentials.resolve(ref)` | Host |
| UI panel、header action、settings card | 通过 `ctx.slots.inject(key, () => ctx.slots.register(...))` 注册 Client Slot | Client |
| UI 需要 Host 能力 | 由 API Gateway claim 的 Typert remote Service | 两侧 |

## Host 侧工作流

阅读 [`references/host.zh.md`](references/host.zh.md)，然后依次验证 package contract → composed Profile → live Fiber → registered capability → exercised behavior → disposal/restart。`--dump-config` 只能证明 composition，不能证明 activation。

## Client 侧工作流

阅读 [`references/client.zh.md`](references/client.zh.md)，了解浏览器 Cordis 应用、受支持的 Typert/API Gateway 边界、client model、lazy-CJS 构建契约与验证方式。只有需求确实要贡献 UI 时，才加载 [`references/slots.zh.md`](references/slots.zh.md)。

### `/api` transport 规则

`@deepseek-ai/dsh-api-gateway` 是 `/api` 唯一 interceptor 的 owner，并从 Typert Registry claim endpoint。第三方 Plugin 不得再次注册 `connection.rpc.intercept('/api', …)`，否则会遮蔽原生 API。Plugin endpoint 应通过带 `typertRemote` binding 与 remote-method marker 的 `TypertRemoteService` 暴露。

## 十个高频陷阱

1. Patch 的 `config` 是整对象替换；要保留的 key 必须全部重写。
2. 可选 Service 应使用 `ctx.get('svc')` / `ctx.inject([...], cb)`；对不存在的 Provider 做 hard `inject` 会让 Plugin 永久停在 PENDING。
3. `turn/*`、`step/*`、`tool/call` 是持久化的 **Session event type**，不是 Cordis Event；应监听 `session/event` 并判断 `event.type`。
4. `tools/pre-execute` 是 waterfall；若不调用 `next()`，会短路所有后续 gate，包括 approval。
5. `execute` 必须响应 `exec.signal`，返回与 `output.schema` 完全一致的 JSON value；只有基础设施失败才 throw（Registry 会映射为 `isError`）。
6. Client 对其他 Plugin package 做 value import 会触发 purity gate；应通过 Slot/Service 协作。
7. UI 无声消失通常是 parent Slot 未挂载、keyed key 错误、id collision 被遮蔽，或 client bundle 未重建。
8. Client component 不能注入 Host Service；应通过 Typert/API Gateway 或 client read model 跨边界。
9. `apply` 外未处理的 Promise rejection 会使 boot 致命失败；异步工作应放进 `ctx.effect`。
10. npm package name 不等于 Plugin identity；row `name`、bundle id、client wire id 是不同概念，都要保持稳定。

## 参考文件

- `references/context.zh.md` — DSH/Cordis 规范词汇与 native/application-defined 边界。
- `references/decision-tree.zh.md` — requirement-to-seam 决策，包括 Cordis dispatch 与 persistence 选择。
- `references/host.zh.md` — Host API surface：Plugin shape、Tools DSL、Event/waterfall、settings、credentials、system prompt、Sessions/Agents、lifecycle、publish/validate。
- `references/client.zh.md` — `dsh.client` 字段、client service/hook、Typert/API Gateway、构建契约、故障表与验证清单。
- `references/slots.zh.md` — 完整 Slot 目录、kind/scope 与源码声明。
- `references/community-ui-patterns.zh.md` — 13 个社区插件的 field note：构建路线、数据通道、已验证实践、漂移风险与反模式。
