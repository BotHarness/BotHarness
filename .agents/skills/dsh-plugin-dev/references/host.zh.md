# Host 侧参考（固定上游 SHA `ddefc45…`，DSH 0.1.6-alpha.2）

引用源码时使用相对于上游仓库根目录的 `path:lines`。更深的源码级笔记见 `docs/research/2026-09-19-dsh-plugin-authoring-host.md`。

## 官方文档地图

- `docs/user/develop/basic/{index,tool,config,publish}.zh.md` — 第一个 Plugin、Tool、配置、打包与安装。
- `docs/user/develop/framework/{index,service,events}.zh.md` — 生命周期/Fiber、Service、Event。
- `docs/user/develop/practice/{index,dynamic-cordis,llm-adapter}.zh.md` — capability role、动态挂载、LLM adapter。
- `docs/cordis-tutorial/01..07` + `docs/cordis-primer.zh.md` — 七节 Cordis 教程。
- `docs/cookbook/{adding-a-tool,adding-a-package,adding-a-settings-card,adding-a-remote-api,extension-cookbook}.zh.md` — 任务配方。
- `docs/capability-seams.zh.md`、`docs/event-producer-consumer.zh.md`、`docs/subsystems/*.zh.md` — Service/Event/subsystem 参考；动态生成的 surface 高于静态列表。

## Package manifest（`packages/util/package-manifest/src/types.ts:27-77`）

| 字段 | 说明 |
| --- | --- |
| `dsh.manifestVersion` | `1`；格式 id，目前不会强制校验 |
| `dsh.bundle.patch` | 指向 patch 文件；Profile launcher 会读取，且必须包含在 `files` 中 |
| `dsh.profile.bundles` | 只出现在 profile 目录内，表示 composition list；不用于发布包 |
| `dsh.client.{platform,inject,immediately,external}` | Client half；`platform: "web"`；见 Client 参考 |
| `engines.dsh` | 声明式 SemVer range；installer/loader 只读，不强制 |

最小发布 Bundle（`docs/user/develop/basic/publish.zh.md`）：

```text
hello-plugin/
├── package.json        { "type": "module", "main": "index.js",
│                         "files": ["index.js", "cordis.patch.yml"],
│                         "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
├── cordis.patch.yml    - insert: [ { id: hello, name: dsh-hello-plugin } ]
└── index.js            export function apply(ctx, config) { … }
```

Dependency 规则（`docs/cookbook/adding-a-package.zh.md:25`）：`@deepseek-ai/cordis` 放在 `peerDependencies`，并镜像到 `devDependencies`；每个 dsh peer 都镜像到 dev；`@deepseek-ai/schemastery` 放在 `dependencies`。Runtime value 只通过 `ctx` 流动；跨 Plugin 使用 `import type` + `declare module`。

## Patch semantics（`vendor/include/src/index.ts:57-141`）

| 形态 | 含义 |
| --- | --- |
| `- insert: [ {id, name, …} ]` | 向 entry list 追加 row |
| `- id: <group-id>` + `insert: […]` | 向 `group: true` row 追加 child |
| `- id: <row-id>` + `config/disabled/inject/…` | 覆盖或禁用已有 row；可选 `name` 是 assertion |

- 同一个 row 以后面的 layer 为准；`config` **整体替换**，不会 deep merge。默认值应放在 Plugin 的 `Config` schema 中，因为用户可能覆盖 row。
- Row option：`id`、`name`（package name/path/file URL）、`config`、`disabled`（接受 `!!js`）、`inject`、`group`、`isolate`/`intercept`（`vendor/loader/src/config/entry.ts:9-22`）。
- `!!js <expr>` 在 row injection 激活后求值；launcher 暴露 `ctx.dshHomePath`、`ctx.cmdlineArgs`。
- Failure posture：空 patch file 会使 boot 失败（使用 `[]`）；缺失 patch file 会失败；target 未匹配或 `name` assertion 失败只 warn + skip。
- Layer 顺序：`dsh.profile.bundles` 顺序 → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` overlay（`apps/cli/reference/README.zh.md:11`）。
- `ctx.plugin(SubPlugin)` 从代码挂载 child Fiber：继承 ctx，有独立 lifecycle，随 parent dispose。条件/内部 sub-plugin 用它；需要用户 enable/configure/override 的内容用 patch row。

## Plugin module

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'
export const inject = ['tools']
export interface Config { greeting: string }
export const Config: Schema<Config> = Schema.object({ greeting: Schema.string().default('Hello') })
export function apply(ctx: Context, config: Config) { /* ctx.tools is ready */ }
```

- 形态可以是 function、object（`export default { name, inject, apply }`）或 class（`extends Service`；提供 Service 时使用 `static inject` 与 `super(ctx, 'key')`）。Loader 会规范化 ESM/CJS/default export（`unwrapExports`，`vendor/loader/src/index.ts:188-196`）。
- `Config` 必须是 Standard Schema（Schemastery/zod）；load 时校验并填充 default。
- 消费：static `inject`（Service 出现/消失时自动 unload/reload）、可选 `ctx.get('svc')`，或动态 `ctx.inject(['settings'], cb)`。
- 提供：`ctx.provide(name, value)` 或 `Service` subclass；为 consumer typing 增加 `declare module '@deepseek-ai/cordis' { interface Context { myService: MyService } }`。
- Isolation：loader config 中的 `isolate` 让 Plugin group 获得独立 instance（`docs/user/develop/framework/service.zh.md:111-141`）。

## Tool（`docs/cookbook/adding-a-tool.zh.md`）

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

ctx.tools.register(defineTool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'Absolute path' },
    limit: { type: 'number' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
  },
}))
```

- Schema 是 `@deepseek-ai/dsh-tools` 自己的 JSON-value DSL（`ParameterSchemaSpec`/`ValueSchemaSpec`），不是 zod。支持 string/number/integer/boolean/null/array/object/`json`/`oneOf`；显式 object node 需要 `additionalProperties`。也接受 MCP 风格的 raw JSON Schema `ToolDefinition`。
- `execute` 返回与 `output.schema` 完全一致的 JSON value；`output.render` 产生 model-facing content。只有 infrastructure failure 才 throw（会变成 `isError`）。
- `exec` 提供只读 `callId/name/arguments/agent/token/signal`；必须响应 `exec.signal`。
- Pipeline seam：`tools/pre-execute`（waterfall allow/deny/**ask**，由 `ctx.approval` 回答）、`ctx.tools.guard()`（monotonic deny）、`tools/execute`（wrap）、`tools/post-execute`、`tools/result`（observe）。Sandbox 是独立轴：`ctx.sandbox.confine(argv, policy)` + `ctx.sandboxPolicy.resolve()`。
- 长时工作：`ctx.jobs.start({ kind, label, owner: exec.agent, run })`；启动后使用 Job 自己的 signal。
- Web call card 来自 keyed Slot `tool.call.toolview`，读取 wire value；Host 通过 `output.presentationMeta` 贡献 metadata，不要期待 `presentCall/presentResult` 绘制卡片。
- Tool 在 `run_code`（PTC）内自动可用为 `await tools.<name>(args)`，无需额外集成。

## Event（`docs/user/develop/framework/events.zh.md`、`docs/event-producer-consumer.zh.md`）

五种 dispatch mode：`emit` / `waterfall` / `parallel` / `serial` / `bail`。Waterfall listener 接收 `(...args, next)`，并且必须调用 `next()` 才会继续：

```ts
ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
  if (!(await isAllowed(exec))) return { kind: 'deny', reason: 'Denied by policy.' }
  return next()
})
```

- Type-safe declaration：`declare module '@deepseek-ai/cordis' { interface Events { 'my-plugin/ready': (p: {...}) => void } }`。
- 命名使用 `namespace/action`。`turn/*`、`step/*`、`tool/call`、`tool/result`、`compaction/*` 是持久化 Session event type；通过 `session/event` + `event.type` 观察。
- 常用 family：`tools/*`、`agent/*`（`created`、`status`、`pre-step`、`request`、`turn-stopping`、`assistant-stream`、`inbox/*`、`disposed`、`error`）、`session/*`（`created`、`event`、`flush`、`disposed`）、`system-prompt/assemble`、`approval/request`、`commands/change`、`settings/*`、`credentials/*`、`workflow/*`、`subagent/*`、`skills/change`、`fs/*-intent`。
- `ctx.on` Registration 属于 effect；`{ prepend: true }` 让 listener 排在普通 listener 之前。

## Settings、credentials、prompt

- 在 `ctx.inject(['settings'], cb)` 内调用 `ctx.settings.installSection(...)`：composition config 是 base，可选 Provider 位于中间，user document layer 在最上层；`get()` 返回 deep-frozen snapshot；`role('secret')` 字段在 protocol surface 被遮蔽。Namespace literal 只能用 `[a-z0-9-]`。
- `ctx.credentials`：config 保存 `CredentialRef`（env-var 风格名称），不保存值；每次 operation 调用 `resolve(ref)`，不要跨 operation cache；`describe/readRecord/…` 管理授权记录。
- `ctx.systemPrompt.section({ name, order, text })` 支持静态 text 或 `(ctx) => string`；`context(...)` 提供 cache-safe durable snapshot；`tools(provider)` 提供 schema；`variable(name, provider)` 提供变量；`system-prompt/assemble` waterfall 是 authoritative，`complete: true` section 不可绕过。

## Session、Projection、Agent

- `ctx.sessions` 提供 live in-memory Session access；committed SessionEvent 通过 `sessionPersistence` 构成 canonical durable log，`session/event` 是 process-local post-commit notification，`sessionQuery` 是派生 cold-search seam。
- `ctx.sessionProjections.register(...)` 把 Session event fold 成供 UI/其他 Plugin 使用的 domain state；Registration 是 effect，unload 后 key 会离开 snapshot；history 可 lazy fold。
- `ctx.agents`：`followup(msg)` 排下一 Turn 并唤醒 driver；`steer(msg)` 提交 next-step input；`inject(msg)` 加入 durable model-facing context 但不唤醒；另有 `cancel`、`whenIdle`。
- 动态 context injection：durable `agent.inject({ content, source })`、`agent/pre-step` waterfall（append 到 `decision.messages`），或 `systemPrompt` contribution。Golden sample：`packages/context/time-context/src/index.ts:153-221`。

## 生命周期（`docs/user/develop/framework/index.zh.md`）

- Fiber state：`PENDING → LOADING → ACTIVE`；apply throw → `FAILED`；`ACTIVE → UNLOADING → DISPOSED`。
- 所有 Registration API 自动 dispose；自定义 resource 用 `ctx.effect(() => cleanup)`。Disposer 逆序调用，但 async disposer 并发运行；有序 cleanup 应放进同一个 effect。
- `dispose` 删除 Registration、递归 dispose child Plugin，并在 async cleanup 完成后 resolve。
- HMR：source 变化 → unload old Plugin → load new code → new `apply`；config change hot-replace；**package install/version replacement 仍需 process restart**。
- Error isolation：可选 row apply failure → warn 并继续；required row failure → app failure；schema failure → 该 row inactive；`apply` 外 unhandled rejection 是 fatal。

## 发布与验证

- 形式：npm（发布预构建 `main`，`files` 包含 patch）、tarball（`pnpm pack`）、git（self-contained `prepare`；pnpm ≥10 受 `allowBuilds` gate；pin commit）。
- 唯一官方 composition check 是 `dsh --profile <p> --dump-config`（显示 row + provenance；`!!js` 不求值）。不存在官方 doctor 或 marketplace validator。
- Compatibility 最终在 import/mount 时暴露；Profile 使用 `autoInstallPeers: false` + lockfile + runtime resolution generation。

## 常见陷阱

1. `config` 整对象替换；必须重写要保留的 key。
2. 不要 hard-`inject` optional Provider，应使用 `ctx.get` / `ctx.inject`。
3. Session event type 不是 Cordis Event。
4. Waterfall listener 必须调用 `next()`，除非有意短路。
5. 必须响应 `exec.signal`；`args` 只读。
6. Patch：空文件 fatal；target 未匹配只 warn-and-skip。
7. 跨 Plugin 只允许 `import type`；runtime value 通过 `ctx`。
8. `apply` 外 unhandled rejection 是 fatal。
9. Installed 不等于 registered；必须由某个 patch 插入 row。
10. 上游 monorepo invariant（`private: true`、版本同步、exports gate）不是外部 package obligation。
