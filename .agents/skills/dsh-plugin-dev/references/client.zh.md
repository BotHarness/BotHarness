# Client 侧参考（固定上游 SHA `ddefc45…`，DSH 0.1.6-alpha.2）

引用源码时使用相对于上游仓库根目录的 `path:lines`。更深的源码级笔记见 `docs/research/2026-09-19-dsh-plugin-authoring-client.md`。

## 文档地图

- `docs/subsystems/web-client.md` — layering（Host → Transport/Remote → client model → UI adapter → Conversation → Slot → React）、browser boot、reconnect。
- `docs/subsystems/client-modules.md` — `dsh.client` scanning、`WebBootGraph`、`/plugins/??<pkg>/client.js&rev=…`、lazy-CJS model。
- `docs/subsystems/slots.md` — Slot spec（declaration、kind/scope、props share、hook、tree）。
- `docs/subsystems/{client-resources,sidebar-right,conversation}.md` — resource URL、right sidebar tab、conversation target。
- `docs/cookbook/adding-a-settings-card.md` — 唯一面向外部的 Client tutorial（Host `installSection` + Browser `slots.register` + packaging）；明确说明没有发布的 preset。
- `docs/cookbook/adding-a-remote-api.md`、`docs/api-gateway.md` — Typert Remote pipeline（仓内生成）。
- `docs/web-styling.md` — CSS Modules + `clsx`、`--dsw-*` token；不用 Tailwind/component library。
- `packages/client/AGENTS.md` — 仓内硬规则（props share、export/ctx discipline、shared module、新 package checklist）。
- `packages/client/README.md` — package map 与 `ctx.*` owner。

## `dsh.client` manifest（`packages/util/package-manifest/src/types.ts:63-77`；parser `packages/client/modules/src/client/manifest.ts:141-178`）

| Key | Type | 含义 |
| --- | --- | --- |
| `platform` | string | 必填；Web consumer 只接受 `'web'` |
| `inject` | string[] | package-name edge：materialize 前先交付被注入 package 的 factory；**不是** activation edge（Cordis Service `inject` 决定 activation） |
| `immediately` | boolean | phase-one preload barrier；仅基础设施 row 使用 |
| `external` | string[] | baseline 外的精确 module-table request（如 `<pkg>/client`）；仅用于 infra/transport，不是 dependency mechanism |

`exports["./client"]` 必须可解析为 string 或 `{ default: string }`；缺失时会报 `client-modules: <pkg> declares dsh.client but exports no "./client" bundle`。Scanning 覆盖 **live Loader entry**；malformed declaration 在 activation 时聚合为 `ClientPackageCompositionError`（fail-loud），steady-state error 只 warn。

最小 manifest（`packages/client/ui-jobs/package.json:16-40`）：

```json
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-conversation"] } },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
}
```

## Runtime

- Entry 是构建后的 `lib/client.js`，形态为 lazy-CJS factory；Client Cordis loader 把它的 export 当作 object Plugin 使用：`export const inject = [...]` + `export function apply(ctx)`。
- Browser half 是**独立 Cordis application**：没有 Host Service injection、filesystem 或 Agent/Session object。`inject` 名称是 Client Service（`slots`、`locale`、`sessions`、`remote`、`connection`、`uiSession` 等）；`apply` 等待它们出现，并在它们消失后重新运行。
- 同一个 package 的 Host half 是普通、往往为空的 Cordis Plugin，用来让 package 成为 Loader entry。
- Component 永远不接收 `ctx`；所有数据来自 Slot props（五种 share）或 standard hook。Business component 不得有 module-level side effect，也不得自建 subscription。

Client Service（来自 `packages/client/README.md` 与各 package README）：

| Service | API 摘要 |
| --- | --- |
| `ctx.slots` | `register`、`registerFactory`、`inject(key, cb)`、`provideRoot`、`install/installLocale`、`entries/entriesOfSlot/snapshot/subscribe/getVersion/onEntryError` |
| `ctx.locale` | `register(ns, { zh, en })`、`addLanguage`、`bind(ns)`；object form 必须同时提供两份 dictionary |
| `ctx.sessions` / `ctx.workspaces` | 与 React 无关的 client read model；通过 `useSessions`/`useSession`/`useWorkspaces` 消费 |
| `ctx.remote` | Typert remote call：`ctx.remote.<ns>.<method>()`、`$on`、`$host` |
| `ctx.connection` | transport primitive 与 connection generation/reconnect；`/api` 始终由 API Gateway 拥有 |
| `ctx.uiSession` | Session source + `registerPendingInteraction` |
| `ctx.theme`、`ctx.layout`、`ctx.sidebarRight`、`ctx.resources`、`ctx.settingsScope`、`ctx.fileUpload`、`ctx.modules` | theme、main-panel selection、right-bar navigation、resource protocol、plugin settings card、upload、module table |

按 scope 可用的 standard hook（`docs/subsystems/slots.md:79-93`）：所有 scope 都有 `useSessions`、`useSessionStatus`、`useSessionRetainInfo`、`useWorkspaces`、`usePanelInfo`；`session` scope 额外提供 `useSession`/`sessionId`/`useProjection`、`useConversation`/`useInput`/`inputActions`、`useChat`、`useTrajectory`。Registration 还可增加 `useStore`/`t`/`useResource` 与 inject-face `use<Name>`。React 版本为 18.2，由 shell shared。

## Slot

机制（`packages/client/ui-slots/src/index.ts`、`ui-renderer/src/client/registry.ts`）：

- Kind：`single`（同 priority 的第二个 Registration throw；更高 priority 遮蔽）、`list`（必须有 `id`，按 `order` 再按 registration 排序）、`keyed`（owner 传 `entryKey`；同 priority duplicate key throw）、`chain`（每项提供 `select(owner)`；最低的 non-null priority 胜出，否则 owner fallback）。
- Scope：`root`、`session-maybe`、`session`。
- 通过 declaration lifecycle 注册：

```tsx
export const inject = ['slots']
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'review', order: 100 }, HeaderAction))
}
```

- 规则：不得有 module-level side effect；Registration 是 Fiber-scoped effect；使用稳定 `id`/`key` + `order`；`label` 可为 thunk 以响应语言切换；原子 multi-registration 可以返回 generator；order 在注册时固定，只能通过 unload 删除。
- Component props 必须由类型推导，不能手写：`PropsRuntime<K>`、`PropsRenderSlots`、`PropsRenderFactories`、`PropsStore`、inject face；ReactNode 只能经 child Slot 传递。
- 源码 declaration 才是真相，公开 docs tree 有滞后，例如 cookbook 的 `settings.plugin.item` 并不存在，而 `sidebar.toggle.badge`、`sidebar.right.tab.document`、`tool.view.cordis` 没写进旧 docs。用 `cordis_inspect what:"client"` 检查 live tree。

完整目录见 [`slots.zh.md`](slots.zh.md)。

## Typert / API Gateway Host 通信

Browser 通过 `@deepseek-ai/dsh-api-gateway` 调用 `POST /api/<namespace>/<method>`。Gateway 拥有该 route 的**唯一 interceptor**，并从 Typert Registry claim method。

在 BotHarness 中，Host Plugin 提供带 `typertRemote` namespace binding 与 remote-method descriptor 的 `TypertRemoteService`。标准 decorator 无法穿过本仓 oxc/tsdown pipeline，因此 `packages/core/src/bridge/rpc.ts` 直接写 protocol descriptor（使用 SRC marker，不做 code generation）。Client 使用 Typert `ctx.remote` face，或为该 namespace 定义/生成的 Gateway wire contract。

硬性 guardrail：第三方 Plugin 不得注册 `connection.rpc.intercept('/api', …)`。第二个 interceptor 会遮蔽原生 controller（settings、model provider、plugin settings、directory picker），即使自定义 endpoint 看起来可用。

当前 Host 使用的 wire shape：

```text
POST /api/<namespace>/<method>
{ type: "client-request", rpcId, method, payload: { args: { ...namedArgs } } }

-> server-response envelope
   ok: true with value
   or ok: false with { code, message, details }
```

- 缺失的 named argument 应直接省略；decoder 会拒绝显式 `undefined` field。
- Browser code 不能注入 Host Service。Remote Service 是跨边界 capability adapter。
- Streaming 需要受支持的 Typert logical stream，或针对固定 Host 验证过的精确 authenticated fetch/SSE route；`$events` forwarding 是 first-party whitelist。
- 独立 Connection RPC channel（`rpc.handle('/my-plugin', …)` 配 matching client channel）是另一条 physical route，不是扩展 `/api` 的办法。选择前验证 authentication、cancellation 与 reconnect behavior。
- Trust boundary：Host/origin allowlist 加 signed cookie；不支持 `dsh web --host 0.0.0.0`。

## 构建契约（必须自行复制；没有公开 preset）

官方 preset 参考：`packages/client/tsdown.client.ts`；platform seed：`packages/client/web/src/platform.ts:8-18`。

| 项目 | 要求 |
| --- | --- |
| Output | CJS，`platform: 'browser'`，entry 为 `lib/client.js`，chunk 为 `client.<name>.js` |
| Self-registration | 每个 output 都包在 `window.__ModuleLoader__.load({ id, factory: (require) => { … return module.exports } })` 中 |
| External | baseline 仅包括 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`，再加 `dsh.client.external` request；其他全部 inline |
| Purity gate | 跨 Plugin 的 `@deepseek-ai/*` value import 如果既未 request、也不能安全 inline，则 build 失败；应使用 Service/Slot |
| CSS | `*.module.css` 生成 hashed class，并在 factory 执行时作为 `<style data-plugin>` 注入；也支持 plain `.css` / `?inline` |
| Sourcemap | 把 `lib/types` tsc map 链入 bundle |
| Two halves | 同一个 package 构建 node lib + browser bundle；`exports` 同时包含 `.` 与 `./client`，`files` 覆盖两者 |
| HMR revision | 所有 chunk 写完后 touch entry（entry byte + completion stamp） |

仓内新 package checklist 还要求 aggregate tsconfig reference、`packages/bundle/web-app/cordis.patch.yml` 中的 `dsh.client` row，以及 web-app package dependency；仓外对应为：Bundle patch 中添加 Host half row，加普通 package dependency。

## Dev loop 与故障表

- 修改后重建 `lib/client.js`（自己的 `tsdown --watch`）。HMR 大约每 500ms poll，unload old Fiber、materialize new bundle、remount Plugin；local React state 会丢失，但 Session/Workspace/connection state 保留。Out-of-tree Plugin 必须自行重建，Host 只服务 `lib/client.js`。

| 症状 | 根因 |
| --- | --- |
| `AggregateError: N client packages failed to compose` / `client bundle not found; run pnpm run build before launch` | 声明了 `dsh.client`，但缺失 `lib/client.js` |
| `… declares dsh.client but exports no "./client" bundle` | 缺失 `exports["./client"]` |
| `bundle <url> loaded without registering "<id>" via __ModuleLoader__.load` | Output 不是 lazy-CJS，例如构建成 ESM |
| `client bundle purity: "<spec>" is not in … externals` | 对另一个 Plugin package 做了 value import |
| `slot "<key>" is not declared` / 同 priority duplicate / store handle 跨 scope | Activation 时 Registration error |
| UI 消失且无 error | Parent Slot 未挂载、keyed key 不匹配、list id collision 被遮蔽 |
| Page-side sync failure | HMR download/materialize failure；在 `Settings → Plugins → Plugin list` 重试 |

验证清单：`window.__DSH_BOOT__.entries` 包含 package；`/plugins/<pkg>/client.js` 返回 200；`Settings → Plugins → Plugin list` 没有 sync failure；`cordis_inspect what:"client"` 能看到 Slot entry；bundle 修改后必须先 rebuild 再探测。

## Golden sample

- `packages/client/ui-jobs` — 最小 browser half（42 行）：locale registration + `conversation.session.header.actions`，零 RPC，只用 standard hook。
- `packages/client/ui-user-questions` — 高级样例：`conversation.composer` chain takeover、`ctx.remote.$on` event、store、typed i18n、two-half package。
