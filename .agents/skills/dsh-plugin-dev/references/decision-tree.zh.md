# DSH seam Decision Tree

请先阅读 [`context.zh.md`](context.zh.md)。对每个需求沿此树判断，并记录唯一的 primary seam、owner 与 durability。混合需求可以由多个 seam 按顺序连接，但这些 seam 仍不能互换。

## 1. 选择 primary abstraction

1. 这个事实是否必须在进程退出后保留，并作为 Agent execution 的一部分重放？
   - 是：追加一个 **SessionEvent**。
   - 如果它是 Agent execution 之外的 application data，选择应用自己拥有的 persistence boundary；不要强行写入 Session history。
2. 调用方是否要求执行一个具体 operation，并获得 result、error 或 cancellation？
   - 是：定义 **Service Definition**，选择 **Provider**，再由 **Consumer** 调用。
3. 这是 process-local notification 或 interception point 吗？
   - 是：使用 **Cordis Event**，并在下一节选择 dispatch mode。
4. Plugin 是否在贡献多个 runtime choice 中的一项？
   - 是：向对应 **Registry** 添加 **Registration**。
5. 需求是否在询问从历史派生的当前状态？
   - 是：构建 **Projection**。搜索使用 **Session Query** index；Chat/Trajectory rendering 使用 **Conversation Assembly**。
6. 需求是否与程序在哪里、怎样运行有关？
   - 进入下方 execution 分支。

快速语言测试：

| 句子形态 | Primary seam |
| --- | --- |
| “做这件事并返回结果” | Service |
| “这件事发生了，感兴趣的一方可以响应” | Cordis Event |
| “当前可用这些实现或 contribution” | Registry + Registration |
| “这件事发生了，replay/audit 必须保留” | SessionEvent |
| “根据历史，现在什么为真？” | Projection |

## 2. 选择 Cordis Event dispatch

1. Fire-and-forget，不需要等待 listener？→ `emit`。
2. 所有独立 listener 都必须完成？→ `parallel`。
3. Listener 需要按顺序执行，推进由 dispatcher 控制？→ `serial`。
4. 第一个有能力的 handler/Provider claim request？→ `bail`。
5. Policy 或 middleware 可以 modify、wrap、approve 或 veto？→ `waterfall`；继续执行必须调用 `next()`。

当一个具名 capability 的完成结果很重要时，用 Service；当 reaction 可扩展且不由 caller 拥有时，用 Event。

## 3. Durable fact、live signal 或 presentation

```text
必须 replay/audit -> SessionEvent
刚刚 commit -> session/event Cordis notification
transient runtime signal -> 其他 Cordis Event
当前 domain state -> Projection
搜索历史 -> Session Query
Chat/Trajectory node -> Conversation Assembly
```

把模型实际可见的 representation 记录进 Session history。不要把理论上可访问的整个 Channel 复制进 Session。

## 4. Registry visibility 或 Service resolution

- 不同 Agent 看到不同 Tool/Skill/Prompt section → 在 scope-aware Registry 上使用 **Agent Scope**。
- 同一 Service name 在不同 subtree 解析为不同 implementation/configuration → 使用 **Service Isolation**。
- 两者可以同时出现，但必须作为两个独立轴记录。

## 5. Execution 分支

1. 需要在 local、container、remote、microVM 间切换？→ 为目标 **Execution World** 替换 capability **Provider**。
2. 需要限制同一 Execution World 中 child process 的 filesystem effect？→ `ctx.sandbox`。
3. 需要 command semantics？→ **Shell**。需要 argv/process primitive？→ **Subprocess**。
4. 现在开始长时工作，之后再 inspect/stop/collect？→ **Job**。
5. 需要 interactive input 或 controlling terminal？→ **Terminal/PTY**。
6. 需要在未来某个时间 delivery？→ **Schedule**。
7. Tool output 过大，不能直接进入 model context？→ **Spill**，并提供有用的 preview 与 locator。

## 6. 选择 persistence authority

- 必须随 Session 重放的 Agent execution fact → 通过 Session Persistence 写入 **SessionEvent**。
- 由兼容 DSH subsystem 拥有的小型 typed non-Session record → 该 subsystem 的 **Storage Domain**。
- Application-owned domain fact → 应用自己拥有的 persistence boundary 与 contract。
- Search/index/projection → 可从 canonical source 重建的 derived data。

不要把 Cordis Event 当作 durable authority。Process-local notification 只能在 canonical write commit 后发出。

## 7. Host/client/UI 分支

1. Browser 需要 Host capability？→ 暴露由 API Gateway claim 的 Typert remote Service。
2. 需要 streaming？→ 使用支持的 Typert stream，或精确、已认证的 fetch/SSE route；必须针对固定 Host contract 验证。
3. 多个 Plugin 要在一个已声明位置贡献 UI？→ **Slots**。
4. 选择 Slot cardinality：
   - `single`：只有一个 winning contribution。
   - `list`：按顺序共存。
   - `keyed`：由 owner-provided key 选择。
   - `chain`：按 precedence 选择第一个 applicable renderer/handler。

API Gateway 拥有 `/api`。再次注册 `connection.rpc.intercept('/api', …)` 不是扩展方式。

## 8. 完成检查

实现前，每项职责都必须回答：

- canonical term 以及 DSH-native/Cordis-native/application-defined 标签；
- durable source of truth（如有）；
- owning Plugin/Fiber 与 cleanup behavior；
- capability 对应的 Service Definition 与 Provider；
- visibility 变化时使用的 Registry/Registration 与 Agent Scope；
- live coordination 使用的 Event dispatch mode；
- 执行代码时的 Execution World 与 cancellation；
- 跨 `/api` 时的 Host/client boundary 与 authorization；
- derived state 的 Projection/index rebuild path。
