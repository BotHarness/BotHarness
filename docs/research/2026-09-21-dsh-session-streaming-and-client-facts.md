# DSH 流式输出与 Client 转发事实核查（0.1.5-rc.2）

Date: 2026-09-21
Scope: 只读核查 pinned DSH `0.1.5-rc.2` 的「assistant 流式输出如何产生、如何被 Host 插件观察、如何到达 Web Client」以及自定义会话面可复用的渲染/分页能力。不修改任何运行时代码，不提交 git。

## 结论摘要

pinned `0.1.5-rc.2` 中，assistant 流式输出有两条**完全不同**的通道，BotHarness 设计必须把它们分开：

1. **持久通道**：`SessionEvent` 只在 turn/step 边界提交，`assistant/message` 携带**完整**组装消息 + 紧凑的 `AssistantStreamRecord[]`，`assistant/attempt` 携带未提交到 surface 的尝试。日志里**没有**逐帧的 assistant 事件；`session/event` 是「已提交事实」的 fire-and-forget 通知。
2. **瞬态通道**：`agent/assistant-stream` Cordis 事件携带进程本地的 `AssistantStreamFrame`（`start` / `chunk{StreamChunk}` / `end`），**不是** SessionEvent、不落盘；loop 在 committed `end` frame 前先把完整紧凑 stream 提交为 `assistant/message` 或 `assistant/attempt`（`dsh-agent/README.md:67`）。

Web 原生链路已经完整存在：Host `SessionController.follow(request, signal)` 在 `assistantStream === true` 时把 `agent/assistant-stream` 映射为 wire `assistant-stream` frame，客户端经由 WebSocket mux `/api/remote.mux` 上的逻辑流消费，再在浏览器侧还原为**瞬态** `assistant/live-chunk` 事件，由 Conversation assembler 渲染成 streaming Markdown（`SessionEventStream`；`AssistantLiveChunkEvent`）。

对 BotHarness 的直接影响：**(a)** 第三方 Host 插件可以完整观察任何 live Agent 的增量 token（`ctx.on('agent/assistant-stream', …, { global: true })`）；**(b)** 一个后期加入的浏览器客户端**只能在同一 Host 进程仍存活时**通过 `session/follow` 的 `assistantStream` baseline 重建进行中的文本，进程重启后不存在部分 assistant 文本；**(c)** BotHarness 要渲染自己的 Channel 流，最稳的出口是复用 `ctx.remote.session.follow`（若 Channel 消息就是 DSH Session）或在精确 Fetch 路由上自建 SSE（`dsh-plugin-dev` decision tree 的同一结论），而不是试图扩展 `ctx.remote.$on` 白名单。

## 证据分级与来源

| 级别               | 位置                                                                                                                          | 说明                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **仓库内安装包**   | `packages/core/node_modules/@deepseek-ai/*`、`packages/client/node_modules/@deepseek-ai/*`                                    | 与 workspace 声明一致的 `0.1.5-rc.2`，`.d.ts` 即 pinned 合约                                               |
| **Profile 安装包** | `/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/*`                                                               | 同版本 `0.1.5-rc.2`（已逐个 `package.json` 核对）；仓库内未安装的 `dsh-api-*`、`dsh-client-ui-chat` 取自此 |
| **Pinned 源码**    | `/private/tmp/botharness-dsh-015rc2`（`git describe` = `dsh-v0.1.5-rc.2`，commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`） | 精确 tag 的只读源码，用于实现细节                                                                          |
| **官方文档**       | `https://deepseek-harness.github.io/deepseek-harness/...`（URL 见文末）                                                       | 与源码一致时以安装包类型声明优先                                                                           |
| **仓库既有调研**   | `docs/client-bridge.md`、`docs/research/2026-09-19-*`                                                                         | 仅作对照，不当作 API 事实                                                                                  |

仓库内版本核对命令与结果：`cat packages/core/node_modules/@deepseek-ai/dsh-session/package.json` → `"version": "0.1.5-rc.2"`；profile 侧 `dsh-api-session-controller` / `dsh-api-gateway` / `dsh-api-remotes` / `dsh-client-ui-chat` 均为 `0.1.5-rc.2`。

---

## A. SessionEvent 模型：哪些是持久的，哪些带增量

### A.1 事件类型全集（13 种核心事件）

`SessionEventMap` 是声明合并的 map，`SessionEventType = keyof SessionEventMap`，`SessionEvent<T>` 是按 `type` 判别的信封（`seq` / `time` / `data`，surface 事件另有 `surfaceOp` / `sourceEventSeqs`）：

- 仓库内：`packages/core/node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts:242-404`（map）、`:460-483`（信封）
- 事件名：`turn/start`、`turn/end`、`step/start`、`step/end`、`user/message`、`system/message`、`assistant/message`、`assistant/attempt`、`tool/call`、`tool/result`、`request/header`、`request/context`、`session/end-seed`
- 官方对照：<https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>（"十三种核心事件变体"）；<https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/llm-streaming>（紧凑 assistant stream）

### A.2 只有两种事件携带 assistant 内容，且都在 step 结算时提交

```ts
// packages/core/node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts:309-327
'assistant/message': {
  turn: number;
  step: number;
  message: AssistantMessage;
  /** Exact timed model stream, compacted without joining delta boundaries. */
  stream: AssistantStreamRecord[];
  usage?: TokenUsage;
  interrupted?: true;
};
'assistant/attempt': {
  turn: number;
  step: number;
  stream: AssistantStreamRecord[];
};
```

- `assistant/message` 的注释明确「A turn cancelled mid-stream finalizes its delivered text/reasoning prefix as this event with `interrupted: true`」——**中断也要等到 step 结算**才落一条带前缀的事件。
- `assistant/attempt` 是「一次模型尝试但没有提交 surface message」的补偿记录（失败/重试/取消/stream error）。
- `AssistantMessage.content` 是 `ContentBlock[]`（`text` / `reasoning` / `image` / `file` / `tool-call` / `tool-result`），`AssistantMessage` 定义见 `packages/core/node_modules/@deepseek-ai/dsh-llm/lib/types/message.d.ts:135-138`。
- `AssistantStreamRecord` 是紧凑表示：连续 text/reasoning/tool-arg delta 各自合成一条 `{type:'text-chunks', time0, index, dt[], texts[]}`，其他 chunk 保留 raw（`packages/core/node_modules/@deepseek-ai/dsh-llm/lib/types/assistant-stream.d.ts:16-40`）。它**保留每个 delta 边界**，`expandAssistantStream()` 可无损还原（同文件 `:71`）。
- 官方文档同述：`assistant/message`「把该 stream 嵌入作为 surface result」（<https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/llm-streaming>）。

### A.3 增量 token 的载体是 Cordis 事件，不是 SessionEvent

```ts
// packages/core/node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:106-137
export type AssistantStreamFrame =
  | {
      readonly type: 'start';
      readonly attemptId: LlmAttemptId;
      readonly revision: number;
      readonly turn: number;
      readonly step: number;
    }
  | {
      readonly type: 'chunk';
      readonly attemptId: LlmAttemptId;
      readonly revision: number;
      readonly index: number;
      readonly time: number;
      readonly chunk: StreamChunk;
    }
  | {
      readonly type: 'end';
      readonly attemptId: LlmAttemptId;
      readonly revision: number;
      readonly index: number;
      readonly outcome:
        | {
            readonly kind: 'committed';
            readonly eventType: 'assistant/message' | 'assistant/attempt';
            readonly seq: SessionSeq;
          }
        | { readonly kind: 'abandoned' };
    };
```

`StreamChunk` 是提供方无关的原始协议（`packages/core/node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts:359-389`）：

```ts
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | {
      type: 'tool-call-delta';
      index: number;
      id: ToolCallId;
      name?: string;
      argumentsDelta: string;
    }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: ReplayEnvelope };
```

顺序保证：`chunk.index` 在一个 attempt 内从 0 密集递增，`revision` 在一个 attached Agent 生命周期内单调（重建从 1 重来）；`end` 之前 loop 已提交持久 settlement（`runtime-types.d.ts:367-378`）。`usage` 在 `finish` 之前、之后无分片（官方 llm-streaming 适配器约定）。

### A.4 其他相关事件

- `tool/call`（`callId` + 未解析的 `arguments` 原始 JSON 字符串）与 `tool/result`（`message` + 可选 `error{name,code}` + 工具私有 `meta`）都在 step 结算边界提交（`types.d.ts:333-361`）。
- Agent 实时协调事件：`agent/created`/`agent/disposed`/`agent/status`/`agent/inbox/*`/`agent/session-start`/`agent/pre-step`(waterfall)/`agent/request`(waterfall)/`agent/request-error`(waterfall)/`agent/assistant-stream`/`agent/turn-stopping`(serial)/`agent/error`（`runtime-types.d.ts:212-417`）。
- 官方事件文档明确：**`turn/*`、`step/*`、`tool/call`、`tool/result`、`compaction/*` 是持久 Session 事件，不是同名 Cordis 事件；要观察就监听 `session/event` 并检查 `event.type`**（<https://deepseek-harness.github.io/deepseek-harness/develop/framework/events>）。

## B. Host 插件如何实时订阅

### B.1 订阅持久事件：`session/event`

```ts
// packages/core/node_modules/@deepseek-ai/dsh-session/lib/types/index.d.ts:51-62
'session/event'(this: Scoped<Session>, session: Session, event: SessionEvent): void;
```

- 语义：**post-commit, fire-and-forget**；listener 快照在 log push 前解析、回调在 push 后运行，observer 抛错被记录且不影响 append（同文件 JSDoc）。
- 作用域：scope-filtered dispatch；默认只收到「经该 agent context 进入」的 session。跨全部 session/agent 观察需要 `{ global: true }`：

```ts
ctx.on(
  'session/event',
  (session, event) => {
    /* ... */
  },
  { global: true },
);
```

`EventOptions.global?: boolean` = "Receive the event regardless of context filter checks"（`/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/cordis/lib/types/events.d.ts:100-106`）。profile 中 `dsh-api-session-controller` 正是这样全局观察：`src/history.ts:145-149`、`src/history.ts:54-64`。

- 生命周期：`ctx.on()` 注册的 listener 是 Cordis effect，插件卸载自动移除（官方 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/>「自动清理」「事件监听器也是效果」；<https://deepseek-harness.github.io/deepseek-harness/develop/framework/events>）。
- 持久化顺序：`SessionStore.flush(session)` 分发 waited 的 `session/flush`（`index.d.ts:398-411`）；`dsh-session` README 明确「持久化插件订阅 `session/event`、在 `session/flush` 排空」（`packages/core/node_modules/@deepseek-ai/dsh-session/README.md:28,70`）。

### B.2 订阅增量 token：`agent/assistant-stream`

```ts
// packages/core/node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:375-378
'agent/assistant-stream'(this: Scoped<Agent>, payload: {
  agent: Agent;
  frame: AssistantStreamFrame;
}): void;
```

- `@mode emit`（fire-and-forget，listener 异常被隔离）。
- 订阅同样需要 `{ global: true }` 才能收到所有 Agent；`SessionController` 的用法是权威样例：

```ts
// /private/tmp/botharness-dsh-015rc2/packages/api/session-controller/src/history.ts:163-173
const disposeAssistantStream = request.assistantStream !== true
  ? undefined
  : this.ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (agent.session.id !== target) return
      buffered.pushBack({ type: 'assistant-stream', frame: ..., ordinal: ++assistantStreamOrdinal })
      notify()
    }, { global: true })
```

- `SessionHistoryController` 构造函数里还有一个长期 accumulator，把每个 session 的最新 live attempt 折叠成「重连 baseline」（`src/history.ts:44-64`；`src/assistant-stream.ts:27-101`）。
- 其他可观察点：`ctx.agents.get(id)` 查 live Agent（`Agent.session` / `Agent.status` / `Agent.ctx`；`dsh-agent` 类型 `runtime-types.d.ts:138-210`）；`Agent.ctx` 内注册的 listener 随 Agent scope 卸载（`dsh-agent/README.md:63`）。Host 插件也可用 `agentEvents(ctx, agent)` / `emitAgentEvent` 反向派发（`packages/core/node_modules/@deepseek-ai/dsh-agent/lib/types/dispatch.d.ts:83-101`）。
- 官方文档同一结论：`agent/assistant-stream`「携带一个进程本地 Assistant attempt 的有序 start、瞬态 chunk 与 end frame……live event 仍是呈现数据而非重放来源」（<https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>）。

## C. 部分文本是否持久？后加入客户端能否重建？

### C.1 持久层：没有 in-flight assistant 文本

- Session 日志只有 `assistant/message` / `assistant/attempt`（结算时），见 §A.2。
- 语义检查点策略 `dsh-session-checkpoint-policy` 只覆盖「model request / top-level tool dispatch / completed agent steps」，**不含逐 token**（`/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-session-checkpoint-policy/lib/types/index.d.ts`）。
- `dsh-session` README 明确：「A hard process loss before settlement leaves no durable attempt stream.」（`packages/core/node_modules/@deepseek-ai/dsh-session/README.md:84`）

### C.2 进程内：有可重连的 baseline，但只在同一 Host 进程

- `dsh-api-session-controller` 在 Host 进程维护 `Map<SessionId, SessionAssistantStreamAccumulator>`（`src/history.ts:44`），`agent/disposed` 时删除条目（`src/history.ts:62-64`）。它把 dense frame 折成有 `revision` 的不可变 snapshot（`src/assistant-stream.ts:27-101`）。
- `SessionFollowRequest` 显式 opt-in：

```ts
// profile: .../dsh-api-session-controller/lib/types/types.d.ts:417-439
export interface SessionFollowRequest {
  readonly address: SessionAddress;
  readonly maxMessages?: number;
  /** Include process-local assistant presentation frames for the Web client. */
  readonly assistantStream?: true;
}
export interface SessionAssistantStreamBaseline {
  readonly revision: number;
  readonly activeAttempt?: SessionAssistantStreamAttempt;
}
export interface SessionAssistantStreamAttempt {
  readonly attemptId: LlmAttemptId;
  readonly startedAfterSeq: SessionSeqCursor;
  readonly turn: number;
  readonly step: number;
  /** Dense position expected for the next live chunk frame. */
  readonly nextIndex: number;
  /** Compact detached stream accumulated at this opening revision. */
  readonly stream: readonly JsonValue[]; // 即 AssistantStreamRecord[] 的 JSON 形态
}
```

- `follow` 的 opening snapshot 携带该 baseline；`revision` 用于连续性校验，缺口触发 rebuild（`src/history.ts:183-200`；客户端 `SessionEventStream` 实现同样逻辑）。

**答案**：late-joining client 可以重建「当前进行中的 assistant 文本」，但**仅限同一 Host 进程仍持有 accumulator 且 session 的 follow 被打开**。Host 重启、Agent dispose、或进程崩溃后再无部分文本；能拿到的只是已结算的 `assistant/message` / `assistant/attempt`。这不是「persistence 里的 partial message」，而是 Host 内存里的 presentation baseline。

## D. Web Client 传输与插件可用通道

### D.1 物理传输：WebSocket mux + `/api` HTTP

- 精确路由：`REMOTE_STREAM_MUX_PATH = "/api/remote.mux"`，JSDoc 为 "Exact WebSocket route carrying every Typert Remote stream"（`/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-api-gateway/lib/types/stream-protocol.d.ts:4`）。
- 逻辑流协议（同文件 `:132-171`）：

```ts
type RemoteStreamClientMessage =
  | { type: 'open'; streamId: string; endpoint: string; payload: unknown }
  | { type: 'cancel'; streamId: string };
type RemoteStreamServerMessage =
  | { type: 'item'; streamId: string; value?: unknown }
  | { type: 'error'; streamId: string; error: RemoteStreamFailure }
  | { type: 'end'; streamId: string };
```

- 一元调用仍走 Connection `POST /api/<namespace>/<method>`，payload 只有 `{ args }`；两层都复用同一 Connection carrier（官方 <https://deepseek-harness.github.io/deepseek-harness/reference/api-gateway>：「Remote 调用使用 Connection 的 `/api` 路由」「会话事件流、分页……可以使用同一个 Connection，但不使用 Remote 方法描述符」）。

### D.2 Native 会话流：`session/follow`（stream-mode Remote 方法）

- 生成描述符中 `session/follow` 是 `mode: 'stream'`、`AsyncIterable<SessionFollowFrame>`（profile `.../dsh-api-session-controller/lib/typert.remote-client.js:841-847`；类型见 `lib/types/client/index.d.ts` 的 `ClientRemote['session']`）。
- Host 端即 `SessionController.follow()`：snapshot（含 projections 与 `assistantStream` baseline）→ 按 seq 连续的 durable event frame → `assistant-stream` frame（`src/history.ts:119-239`）。
- Client 端 `SessionEventStream extends RemoteJournalStream<…, SessionAssistantStreamFrame>`；native client **总是** `assistantStream: true`（`/private/tmp/botharness-dsh-015rc2/packages/api/session-controller/src/client/transport.ts:179-183`）。
- 浏览器消费路径（profile 安装包 + pinned 源码）：

```
Host agent/assistant-stream
  → SessionController.follow(assistantStream:true)            [Host]
  → wire SessionFollowFrame{type:'assistant-stream'}          [/api/remote.mux]
  → SessionEventStream (RemoteJournalStream notification)     [browser]
  → AssistantLiveChunkEvent{type:'assistant/live-chunk'}      [transient SessionEventLikeEntry]
  → Conversation assembler → chat 'assistant-step' → AssistantMarkdown{streaming:true}
```

`AssistantLiveChunkEvent` 与 transient entry 形状（profile `.../dsh-api-session-controller/lib/types/client/contract/events.d.ts:5-37`）：

```ts
export interface AssistantLiveChunkEvent {
  readonly type: 'assistant/live-chunk';
  readonly seq: number; // 用小数序插入 durable seq 之间
  readonly time: number;
  readonly data: {
    readonly attemptId: LlmAttemptId;
    readonly turn: number;
    readonly step: number;
    readonly chunk: StreamChunk;
  };
}
export type SessionEventLikeEntry =
  { type: 'event'; event: SessionEvent } | { type: 'transient'; event: AssistantLiveChunkEvent };
```

`SessionEventChange` 有专门的 `{ kind: 'settle-assistant', attemptId, entry? }`：结算时只移除该 attempt 的 transient 行、套用 durable settlement（同文件 `:32-53`；`dsh-client-ui-conversation/README.md:30`）。

### D.3 插件客户端能用的通道

- **逻辑流**：`ctx.remote.$stream(options)` 是公开工厂，`RemoteStreamOptions.open: (signal) => AsyncIterable<Item>` 由域自己实现（profile `.../dsh-api-gateway/lib/types/client/index.d.ts:18-24`、`.../client/remote-stream.d.ts:16-58`）。底层 `RemoteStreamMuxClient`/`openRemoteStream` 是 Gateway 私有，浏览器没有「无类型 endpoint opener」：`ClientConnectionRpc.open?` 明确 "Browser transports omit this method; API Gateway owns their WebSocket mux."（profile `.../dsh-client-connection/lib/types/rpc.d.ts`）。
- **转发事件**：`ctx.remote.$on(event, listener)` 只接受宿主 assembly 选中的白名单；`dsh-api-session-controller` 自己的选择是 `api-session/activity|added|error|removed|status`（profile `.../dsh-api-session-controller/lib/types/remote-events.d.ts`）。`API_REMOTE_FORWARDED_EVENTS` 是**第一方静态清单**，第三方包不能追加；额外事件需要显式 build-time 选择（`dsh-api-remotes/README.md:41-45,71-74`）。
- **Typert 流方法**：Host 侧 SRC marker 支持 `mode?: 'stream'`（pinned 源码 `packages/typert/protocol/src/index.ts:89-103`；Gateway `srcDescriptor` 透传 `marker.mode`，`stream()` 要求 `descriptor.mode === 'stream'`，`packages/api/gateway/src/index.ts:753-754,321-341`）。但**浏览器侧**要触达自定义 stream endpoint，必须有挂载的 generated contribution（`ctx.remote.$mount`）；`dsh-api-remotes` 的贡献集是构建期静态的，仓库外能否自行生成/手写严格 contribution 未验证（见 §Version-sensitive）。
- **精确 Fetch 路由**：`ctx.connection.fetch.register({ path, methods, requestBody, fetch })` 用于「流式或浏览器原生响应」，是第三方在浏览器做 SSE/长轮询的官方出口（profile `.../dsh-client-connection/lib/types/rpc.d.ts` 的 `HostConnectionFetch`）。
- **禁用项**：`/api` 的**唯一 interceptor 槽位**归 `@deepseek-ai/dsh-api-gateway`，插件不得 `connection.rpc.intercept('/api', …)`（`docs/client-bridge.md:20`；gateway 官方文档同述 endpoint 认领规则）。BotHarness 现在的做法（SRC marker + hand-written descriptor，`packages/core/src/bridge/rpc.ts:38-59,84-90`）是合法的 endpoint 认领，不是 intercept。
- 既有调研同结论：第三方实时性出口 = 精确 Fetch 路由上的自建 SSE/长轮询；`$events` 白名单不可扩展（`docs/research/2026-09-19-dsh-plugin-authoring-client.md:289,334`）。`dsh-plugin-dev` decision tree 亦写「Need streaming? → use a supported Typert stream or an exact authenticated fetch/SSE route」。
- **副作用警告**：Host `follow` 在 `address.kind === 'session' && source.source === 'prepared'` 时会 `promote()`（后台 `resolveObservedAgent`，即恢复冷 Session 的 Agent；`src/history.ts:202-210`；`src/index.ts:173-184`；`SessionObservation.source: 'live' | 'prepared'` 见 profile `.../dsh-session-query/lib/types/observation.d.ts:7-9`）。订阅一个冷 Assignment Session 的日志流会**唤醒它**，这是 UI 语义而非只读语义。

## E. Slots 与可复用渲染

- 自定义完整会话面：`conversation.view` 是 `kind: 'list'`（scope `session`）的已注册 View，一次渲染一个；默认选择顺序是「持久化偏好 > `chat` > 无」，永远不会选「第一个注册的 View」（`packages/client/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:157-161`；`README.md:43`）。注册 View 需要 `ctx.uiConversation.views.register(...)`（`README.md:34`）。
- 更细的 chat 内部扩展：`conversation.chat.node`（keyed by `ChatNodeKind`，可替换某类节点渲染器）、`conversation.chat.commandview`（keyed）、`conversation.chat.turnTail`（chain）、`conversation.chat.assistant-actions`（list）、`conversation.message.images`（single）（profile `.../dsh-client-ui-chat/lib/types/client/contract/slots.d.ts`）。
- 布局级槽位：`main.conversation`（single, `session-maybe`）、`conversation.session`（single）、`conversation.session.header*`、`conversation.composer`（chain，可临时接管 composer）（`.../dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:111-200`）。
- **Streaming Markdown 可直接复用**：
  - `MarkdownText`（`@deepseek-ai/dsh-client-ui-primitives`，公开导出）带 `streaming?: boolean`：流式期间除尾部两块外全部冻结为缓存 React 元素，只有尾部重新 parse；fence 按增长增量高亮；`labels` 必须引用稳定（每 chunk 换 identity 会丢弃 streaming 缓存）（`packages/client/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/markdown/MarkdownText.d.ts:16-41`）。
  - 同包公开 `CodeBlock`、`JsonBlock`、`DiffBlock`、`TerminalBlock`、`ReadBlock`、`SearchBlock`、`WebBlock`、`JsonTree`、`extractMarkdownPlainText`（`lib/types/index.d.ts:40-64`）。
  - 更高层的 `AssistantMarkdown`（blocks + `streaming` + `interrupted`）属于 `dsh-client-ui-chat` 的内部实现（profile `.../dsh-client-ui-chat/lib/types/client/chat/AssistantMarkdown.d.ts`），不是 primitives 的公共面；BotHarness 要么自建 block→text 组装，要么直接对拼接文本用 `MarkdownText`。
- 插件需要自己把 `StreamChunk` delta 折叠为 blocks/text：`BlockAssembler` 是共享实现（`packages/core/node_modules/@deepseek-ai/dsh-llm` 的 `assembler` 导出；官方 llm-streaming 页有完整签名）。原生 chat 的 `assistant-step` Definition 直接消费 transient `assistant/live-chunk` 并在 `step/start`→`assistant/message` 生命周期内维护 blocks（pinned 源码 `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts:231-326`，其中 `updateChunk` 处理 delta、`publication` 对非 `usage`/`finish` chunk 用 `animation-frame` 节流）。

## F. 分页/cursor 与虚拟化

- 内建消息分页是「message-aligned backwards history」：

```ts
// profile: .../dsh-api-session-controller/lib/types/types.d.ts:409-415,469-473
export interface SessionPageRequest {
  readonly address: SessionAddress;
  /** Inclusive log cut obtained from the corresponding follow opening frame. */
  readonly throughSeq: number;
  readonly beforeSeq?: number;
  readonly maxMessages?: number;
}
export interface SessionPage {
  readonly records: readonly SessionHistoryRecord[];
  readonly hasMore: boolean;
}
```

默认 `DEFAULT_MAX_MESSAGES = 50`（pinned 源码 `src/history.ts:38`），`throughSeq` 必须来自同一条 follow 的 opening frame（`src/history.ts:79-99` 校验越界/不连续）。

- 客户端侧的分页/续接由 `RemoteJournalStream`（`opened`/`entry`/`notification` 帧，`replace`/`prepend`/`append` 发布）与 `SessionEventStream` 托管，`hasMore` 驱动 `prepend`（profile `.../dsh-api-gateway/lib/types/client/journal-stream.d.ts`；`dsh-api-session-controller/lib/types/client/transport.d.ts:14-69`）。
- UI 侧标准 prop 是 `loadOlder()` 与 `loadThrough(seq)`（profile `.../dsh-client-ui-chat/lib/types/client/contract/slots.d.ts:114-119`；`ChatView.tsx:705-788` 渲染 “加载更早” 按钮，无自动无限滚动加载）。
- **虚拟化：在 pinned 安装包与 ui-chat/ui-conversation 源码中未发现**任何 `react-window` / `react-virtuoso` / 自研虚拟列表依赖或实现（`dsh-client-ui-chat/package.json` devDeps 无虚拟化库；全目录 grep `virtual|windowing|overscan` 无命中）。transcript 渲染的是「当前已加载的有界事件窗口」，靠分页限制体积、靠 scroll anchor/ResizeObserver 维持位置（`dsh-client-ui-chat/README.md:55`）。这与「先分页、后虚拟化」的设计含义一致：BotHarness 起步不需要虚拟化，长 Channel 需要自己控制窗口大小。

## G. 瞬态 live chunk 的消费者画像：DSH Native 实际怎么用「草稿」

- **消费者全在 presentation 层**：pinned 源码中 `assistant/live-chunk` / `AssistantLiveChunkEvent` 的消费者只有 `ui-chat`（assistant / turn-tail / turn-process / fallback nodes）、`ui-trajectory`、`ui-conversation`（assembler / location-index）与 `dsh-api-session-controller/src/client`（传输与 baseline）。没有任何非 presentation 消费者：`packages/client`、`packages/api`、`packages/agent` 中 `tts|speech|voice` 全无命中，安装的 profile 里也没有 voice/TTS 包。
- **多消费者共享同一条流**：同一个 transient 事件被 chat 与 trajectory 两个 ViewDefinition 各自折叠（`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts:300-315`；`packages/client/ui-trajectory/src/client/trajectory-assistant-definition.ts:226-231,347-351`），可见性与发布节奏由各自决定（`publication: animation-frame`，`usage`/`finish` 不发布：`assistant.ts:321-325`、`trajectory-assistant-definition.ts:376-379`）。
- **流中的 tool-call 同样被折叠为可见 presentation**：`tool-call-delta` 以 `argsRaw = base.argsRaw + argumentsDelta` 累积（`assistant.ts:121-135`；`trajectory-assistant-definition.ts:154-166`）。chat transcript 认为 tool-call 不可见（`blockIsVisible` 对 `kind === 'tool-call'` 返回 false，`assistant.ts:61-65`），trajectory/process 面则渲染它——「工具参数流」原生就是 presentation，只是放在哪个 surface 由 View 决定。
- **连续性协议**：客户端 `assistant-stream.ts` 维护 `activeAttempt` 与 `nextIndex`，帧序号不连续即 `{ type: 'rebaseline' }` 重新对齐（`packages/api/session-controller/src/client/sessions/assistant-stream.ts:35,108,139,166-176`）；Host 侧提供 process-local baseline（见 §C.2）。
- **结算即替换**：durable `assistant/message` 到达后 `settleMessage` 用最终 blocks 覆盖 transient 状态（`assistant.ts:164-178`），`settle-assistant` 变更移除 transient 行（见 §D.2）。
- **不可逆动作只认结算**：tool 派发、model request、Session 持久化都不消费流中块；`BlockAssembler.interruptedBlocks()` 明确 "Tool calls are omitted because interruption precedes dispatch"（`packages/core/node_modules/@deepseek-ai/dsh-llm/lib/types/assembler.d.ts`），即派发发生在完整组装之后。

**结论（事实层）**：DSH 的规则不是「不许看草稿」，而是「草稿只能喂 presentation；每个 consumer 自己节流、按 revision 对齐、用结算替换；任何 durable/不可逆副作用只认结算」。pinned 原生没有 latency-sensitive speculative 消费者（无 TTS），因此没有「先说话再校正」的现成先例；但 `attemptId + revision + settle/abandon` 的基础设施已具备这种消费模式所需的一切。

## H. 运行中继续发消息：DSH Native 的 send 语义

- 四个入口（`packages/core/agent/src/runtime-types.ts:204-241`）：`followup(message)` = 队列成**自己的下一个 turn**（"becomes the sole ordinary message of its own turn"）并唤醒；`steer(message)` = 在最近一个 step 边界被消费（idle 时直接开 turn）；`inject(message)` = 只作下一 pre-step 的模型上下文、不唤醒；`send(message, target, wakeup)` 是通用形式。`cancel(cause, { keepInbox })` 可保留 queue/steering。
- API 侧的用户发送：`if (request.mode === 'steer') agent.steer(message) else agent.followup(message)`；steer 只在 running/next-turn 时可用，否则返回 `session/steer-unavailable`（`packages/api/session-controller/src/commands.ts:363-364,463-464`）。
- UI 侧不阻塞：composer 有本地 optimistic echo，直到 durable `user/message` 渲染才被替换（`packages/client/ui-chat/src/client/chat/MessageItem.tsx:260-297`）；pending steering 另有 Host 权威投影（`:231-234`）。
- 因此「用户持续发、bot 排队消化」在 DSH 是默认语义：每条 send 进入 Agent inbox，成为独立 followup turn（或 steer 进当前 step），由 Agent loop 串行消化；UI 立即回显，不等 turn 结束。

---

## Version-sensitive / unverified

以下事项在本轮只读核查中**未能以 pinned 运行实例证实**，设计时须标为待验证：

1. **仓库外生成 Typert `/remote` contribution**：官方管线（`@deepseek-ai/dsh-typert-generator` + Host aggregate ts.Program + 根构建顺序）在 DSH 仓库外是否可复现未实测；既有调研 §5.1 亦标「未验证」（`docs/research/2026-09-19-dsh-plugin-authoring-client.md:290`）。手写一个带 strict codec 的 `TypertRemoteContribution` 并经 `ctx.remote.$mount()` 挂载在类型上可行（`TypertRemoteContribution` 只是不可变的 descriptors 数组，`lib/types/typert.remote-client.js` 默认导出即此形状），但未在运行中的 browser profile 里试过。
2. **自定义 stream-mode endpoint 的浏览器可达性**：Host SRC marker 支持 `mode: 'stream'`，但客户端没有无类型 opener（`ClientConnectionRpc.open` 浏览器缺省）。除「生成 contribution」外没有看到官方手写路径；未验证。
3. **`session/follow` 的 promote 副作用**：源码显示冷 session 会被后台恢复（`src/history.ts:202-210`）。对 BotHarness Assignment Session 的实际效果（是否会与既有 Assignment Runtime 的生命周期冲突）未做运行时实验。
4. **`assistantStream` baseline 的 LRU 上限**：`SessionHistoryController.assistantStreams` 未见容量上限（pinned 源码 `src/history.ts:44`），长进程/多 session 时的内存行为未测。
5. **pinned profile 是 0.1.5-rc.2，但既有调研（2026-09-19）部分内容基于 `0.1.6-alpha.2`**：本文所有类型引用均重新按 `0.1.5-rc.2` 的安装包核对；既有调研的 alpha 结论只能作方向参考。
6. `dsh-client-ui-chat` 的 `AssistantMarkdown` 是包内路径（`lib/types/client/chat/AssistantMarkdown.d.ts`），未验证它是否经 `./client` 公共导出——设计上不要依赖它，用 `ui-primitives` 的 `MarkdownText`。

## Implications for BotHarness（分析，非事实）

> 以下是从上述事实推导的设计含义，不是 DSH 保证的行为。

1. **Host 侧观察 bot 输出是可行的、且有官方 seam**：BotHarness 的 Assignment Session 就是 DSH Agent，`ctx.on('agent/assistant-stream', ({agent, frame}) => …, { global: true })` 能在同一 Host 进程内拿到逐 chunk 的 `StreamChunk`。把它当成「Channel 消息流」的源即可，不必依赖 session 日志轮询。但必须自己折叠 blocks（复用 `BlockAssembler`）并自管 attempt/revision 连续性。
2. **不要把 Channel 流做进 SessionEvent**：「SessionEvent is not a per-frame UI bus」（`.agents/skills/dsh-plugin-dev/references/context.md:131`）。Channel 消息如果要持久，应走 BotHarness 自己的存储或一条结算型 SessionEvent；逐帧只做瞬态转发。
3. **浏览器分发有三条路，按成本排序**：
   - 若 Channel 消息恰好可以指向一个 DSH Session（例如 Assignment 的 sessionId），**复用 `ctx.remote.session.follow` + `assistantStream:true`** 是最省事、最贴近原生、自带重连 baseline 的方案；代价是语义绑定到 DSH 会话、且 follow 冷 session 会唤醒它。
   - 若要 BotHarness 自有 wire 形状，**精确 Fetch 路由 + SSE**（`ctx.connection.fetch.register`）是已验证过的官方出口，客户端用 `EventSource`/fetch 流；这是 `docs/client-bridge.md:73,84` 预留的方向。
   - 不建议为 MVP 自建 stream-mode Typert endpoint：它需要生成 contribution，且仓库外可复现性未验证。
4. **渲染复用**：客户端拿到的若是 `StreamChunk` JSON，可直接映射为 `BlockAssembler` 的 `text-delta`/`reasoning-delta`，再用 `MarkdownText streaming` 渲染；`MarkdownText` 的 `labels` 必须 memoize，否则每个 chunk 丢缓存。若走 `session/follow`，客户端更简单：在 `SessionEventLikeEntry` 层就能得到 `assistant/live-chunk`，与原生 chat 一致。
5. **后加入/重连语义要在产品层写清楚**：进程重启后没有「正在生成到一半」的文本，只有已结算消息；若要跨重启呈现「进行中」，需要 BotHarness 自己在 Host 侧为 Channel 维护进程外状态（例如 Channel message 的状态机 + 周期性 flush），这不是 DSH 提供的。
6. **分页/虚拟化**：历史用 `session/page` 的 `beforeSeq`/`maxMessages`/`hasMore` 语义或 BotHarness 自己的 cursor；UI 侧无内建虚拟化，Channel 窗口大小要自己的策略（例如最近 N 条 + “加载更早”）。

## Sources

| 来源                                                                                                                                      | 内容                                                                                   | 日期       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| `packages/core/node_modules/@deepseek-ai/dsh-session/lib/types/{types,index}.d.ts` (+ `README.md`)                                        | SessionEventMap、`session/event`/`session/flush`、`Session.append`、flush 语义         | 2026-09-21 |
| `packages/core/node_modules/@deepseek-ai/dsh-agent/lib/types/{runtime-types,dispatch}.d.ts` (+ `README.md:67`)                            | `AssistantStreamFrame`、`agent/*` 事件全集、`agentEvents`                              | 2026-09-21 |
| `packages/core/node_modules/@deepseek-ai/dsh-llm/lib/types/{types,assistant-stream,message}.d.ts`                                         | `StreamChunk`、`AssistantStreamRecord`、`AssistantMessage`                             | 2026-09-21 |
| `/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/**`（0.1.5-rc.2）                       | `SessionFollowRequest.assistantStream`、baseline、`AssistantLiveChunkEvent`、page 约定 | 2026-09-21 |
| `/private/tmp/botharness-dsh-015rc2/packages/api/session-controller/src/{history,assistant-stream,index}.ts`（`dsh-v0.1.5-rc.2`）         | follow 实现、promote 副作用、accumulator                                               | 2026-09-21 |
| `/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-api-gateway/lib/types/{stream-protocol,types}.d.ts` + `client/*.d.ts`    | `/api/remote.mux`、逻辑流协议、`$stream`/`$on`/`$mount`                                | 2026-09-21 |
| `/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-client-connection/lib/types/rpc.d.ts`                                    | `/api` HTTP、`ClientConnectionRpc.open` 浏览器缺省、Fetch 路由                         | 2026-09-21 |
| `/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-api-remotes/README.md`                                                   | 构建期固定选择、白名单不可运行时扩展、SSE 边界                                         | 2026-09-21 |
| `packages/client/node_modules/@deepseek-ai/dsh-client-ui-conversation/**`、`dsh-client-ui-primitives/**`、`dsh-client-ui-slots/README.md` | View/Node slots、`MarkdownText` streaming、store 合约                                  | 2026-09-21 |
| `/private/tmp/bh-dsh-home/profiles/node_modules/@deepseek-ai/dsh-client-ui-chat/**`                                                       | 原生 chat 消费 `assistant/live-chunk`、`loadOlder`、无虚拟化                           | 2026-09-21 |
| <https://deepseek-harness.github.io/deepseek-harness/develop/framework/events>                                                            | 事件模式、`session/event` vs `turn/*`、listener 自动清理                               | 2026-09-21 |
| <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>                                                           | `AssistantStreamFrame`、13 种核心事件、agent 事件分类                                  | 2026-09-21 |
| <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/llm-streaming>                                                  | `StreamChunk`、紧凑 stream、`agent/assistant-stream` 为呈现数据                        | 2026-09-21 |
| <https://deepseek-harness.github.io/deepseek-harness/reference/api-gateway>                                                               | Remote 一元 vs 流、`ctx.remote`、`/api` 单一 interceptor、SRC 回退                     | 2026-09-21 |
| <https://deepseek-harness.github.io/deepseek-harness/develop/basic/>                                                                      | 插件形态、`ctx.effect`、自动清理                                                       | 2026-09-21 |
| `docs/client-bridge.md:20-21,73,82-84`；`docs/research/2026-09-19-dsh-plugin-authoring-{host,client}.md`（既有调研，二级）                | `/api` 归属、第三方实时性出口、白名单不可扩展                                          | 2026-09-21 |
