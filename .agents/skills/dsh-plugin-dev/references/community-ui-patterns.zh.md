# 社区 UI 实践（field notes）

快照日期 2026-09-19，来自固定 SHA 上 13 个社区 Plugin。证据位于仓库研究笔记：`docs/research/2026-09-19-dsh-client-ui-common-patterns.md`、`2026-09-19-dsh-client-ui-flagship-dives.md`、`2026-09-19-dsh-market-deep-dive.md`、`2026-09-19-dsh-client-build-templates.md`。这些是 field note，不是规则；若与 [`client.zh.md`](client.zh.md) 的官方 contract 冲突，以官方 contract 为准。

## 1. UI 开发者实际怎样构建 UI

目前**没有公开发布的 Client build preset**，因此每个 out-of-tree Plugin 都要自行复制 lazy-CJS contract。生态中有三条路线：

| 路线 | 示例 | 判断 |
| --- | --- | --- |
| **tsdown，自包含双配置** | dsh-compass、dsh-agent-team-gui、dsh-file-explorer、dsh-market | 最接近官方 preset（同样是 tsdown/rolldown + lightningcss），天然支持 CSS Modules；推荐路线 |
| **esbuild + 手写 loader wrapper** | dsh-rewind | 最显式、可审计，带 post-build smoke assertion 与 build hash；若不加 plugin 则没有 CSS Modules，是可靠 fallback |
| **不可移植，应避免** | 动态 import 本地 Harness checkout（agent-team）；引用仓外 `../tsdown.client.ts`（side-tasks、plugin-store）；无构建的手写 JS bundle（channel-view、herald） | 无法独立构建；artifact/source drift 不可验证 |

UI surface 已经收敛，差别主要在**数据通道**。以下记录的是 field usage，不代表推荐：

- 官方 face/hook（`ctx.sessions`、`ctx.workspaces`、`uiConversation`）——read 的默认选择；
- API Gateway/Typert remote Service——受支持的 `/api` 路线；BotHarness 使用 SRC remote-method descriptor；
- Plugin-owned channel 上的 generic Connection RPC——独立 physical route；必须验证 auth/reconnect/cancellation，且不能 intercept `/api`；
- Plugin-private HTTP route（`fetch('/my-plugin/...')`）——必须自行负责 auth；已有 live Plugin 因此收到 security complaint；
- Typert `@Remote` code generation——上游常见；out-of-tree generation 可能需要适配，而 descriptor-based registration 已在 BotHarness 验证；
- 直接读 DOM/FS——脆弱；生态中存在，但应避免。

## 2. 值得复制的共性

- 使用 `ctx.slots.inject(key, () => ctx.slots.register(spec, Component))` 注册；不要在 declaration lifecycle 外调用 `register`。
- `dsh.client.inject` 列出**官方 package name**；module `inject` 列出**Service name**（`slots`、`sessions`、`locale` 等）。
- React 与 shell shared module 保持 external；其他依赖全部 inline。基线为 React 18。
- 用 `ctx.effect(() => dispose)` 清理；style、Registration 与 subscription 都要返回 disposer。
- 优先从官方 Client Service 读取；store/controller 上使用 `useSyncExternalStore`，不要在 component 中自建 ad-hoc subscription。
- 使用 `--dsw-*` token；不用 Tailwind 或 component library。选择 CSS Modules 或 injected `<style data-plugin>`。
- i18n 使用 `ctx.locale.register(NS, { zh, en })` 加 registration field `locale: NS`；Slot label 使用 thunk。
- Typert remote Service 使用稳定 namespace；或为独立 Plugin-owned channel 命名 `<pkg-or-ns>/<method>`；`/api` 始终由 API Gateway 拥有。
- 发布双语 README 与截图；声明 Node 22.19+/24+。

## 3. 已在 field 验证的最佳实践

| 实践 | 为什么值得保留 |
| --- | --- |
| **Compile-time Slot pin** — 用 `readonly (keyof SlotMap)[]` 测试所有 Registration | 被删除的 Slot 会让 `slots.inject` 永久等待且不报错；已有 Plugin 把 card 发到被上游删除的 key，最终无声消失 |
| **可选 Service 使用嵌套 `ctx.inject`**（`settingsScope`、`connection`、`webServer`） | 对 Host 可能缺失的 Service 做 module-level `inject` 会停住整个 Plugin；嵌套后只退化为“少一张 card” |
| **Post-build smoke assertion** — wrapper format、registration id、无泄漏 define、export、declaration file | lazy-CJS contract 最容易被无声破坏；应让它变成 build failure |
| **把 build hash 注入 bundle** | 能确认浏览器实际运行哪个 commit；否则 cache 中 stale bundle 无法辨认 |
| **Slot bridge + `createPortal`** — 在 `list` Slot 注册 zero-UI component，把真实 UI portal 到 Host row | 不依赖 DOM anchoring，又能装饰 Host-owned row（例如 per-message action）的唯一受支持方式 |
| **Projection + pure presenter + `useSyncExternalStore`** | Fact 在 Host fold 成 Session-list snapshot，Component 只绑定 interaction；row data 零 RPC、可跨 reconnect，且无需 DOM 即可单测 |
| **Per-session draft/pending persistence** — localStorage + `useSyncExternalStore` + timed file backup + TTL resume | 用一个 model 覆盖 Session 切换、页面刷新与 restart |
| **Typed i18n 单一真相源** — `zh` 定义 key，`en` 类型为 `Record<keyof typeof zh, string>` | 缺失翻译在 compile time 报错，而不是运行时 fallback |
| **把 `api()` 锚定到 `document.baseURI`** | 可在 reverse proxy 与 sub-path deployment 后工作 |
| **ErrorBoundary 提供 crash 后仍可用的“导出日志”按钮** | 第三方 panel 不应拖垮 shell，crash report 应是一份可粘贴事实 |
| **Compat audit ledger** — 固定已测 Host 版本，记录每个删除/重命名 API 及 replacement，并在 test 中断言 seam | Preview 期最大风险是版本漂移；“test 就是 audit”胜过过期 README |
| **CI 安装真实 Host**（固定 `dsh`、真实 Profile、browser smoke） | 捕获“所有 test 通过，但 install 已坏”的 Plugin 特有失败 |

## 4. 最大风险是版本漂移

- **Slot 被删除：**`settings.plugin.item` 已不存在；改用 `plugins.bundle.config`（以 Bundle package name 为 key）或 `plugins.item`。被删除的 Slot 无声失败，只表现为 card 不渲染。
- **Navigation 已变化：**当前入口是 `ctx.uiWorkspace.openSession(...)`；旧的 `sessions.open` / `openSubagent` 形态已经移除。
- **声明真实 intent：**使用 `dsh.engines.dsh` 与经过测试的 peer range；只声称真正测试过的版本。
- **让 declaration 与 usage 相符：**扫描自己的 `ctx.*` usage，与 `dsh.client.inject` 对齐。未使用的 seam 会扩大 compatibility surface，缺失的 seam 会永久等待。
- **不要 hardcode DOM 或 Host 文案**（class name、`'Send'`/`'发送'` aria label）；Host restyle 或语言切换会立刻破坏它。

## 5. 生态中已经出现的反模式

- 通过 class name、tab label 或 2 秒 watchdog 锚定 Host DOM。
- 绕过 Host API，直接读写 `$DSH_HOME` 下的 Session directory 或 cache。
- 用 `window.confirm`/`alert` 代替 dialog；用 silent `catch {}` 吞掉报告。
- 单个 5,000 行 component 加 100 多个 `useState`，导致 state ownership 不清。
- 无界 observer/scan（反复全量扫描、不释放 subscription），造成典型“UI 变慢”回归。
- 发布无法重现构建的预构建 bundle，或把 `lib/` 当 source。
- 使用他人的 scope 发布，或使用 npm 已存在的 package name。
- 缺少 LICENSE，阻碍企业使用与 marketplace listing。

## 6. Build template

三种 field-proven template——rewind 的 esbuild + assertion、compass 的最小 tsdown config、dsh-market 的可重现 tsdown + artifact governance——已在 `docs/research/2026-09-19-dsh-client-build-templates.md` 中按维度比较，并包含推荐方案与 M3 落地清单。
