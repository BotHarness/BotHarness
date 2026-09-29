# DSH 官方 browser use 能力与 BrowserSkill 接入调研

日期：2026-09-29

问题：官方 DSH（DeepSeek Harness）在 `0.2.0-rc.1` 是否存在 browser use 能力（seam / 内置工具 / 仅 MCP / 只能走 computer-use）？如果要给 PersonaBot 接入 browser use，有哪些真实可用的 seam 与机制（对照我们已有的 computer-use 接入方式），各自的所有权、授权、审计、观察、多会话、隔离与版本耦合代价是什么？本文只做调研，不产生 ADR、不做决策。

## 来源基线

- 本仓库：`BotHarness` main @ `4e2179b`（2026-09-29 检出，clean）。pin `@deepseek-ai/dsh@0.2.0-rc.1`（`package.json:34`，`pnpm-lock.yaml:172`）。
- 实际运行的 DSH 产物：`node_modules/@deepseek-ai/dsh`（`0.2.0-rc.1`，82 个 dependency）；其依赖闭包里的 `@deepseek-ai/dsh-computer-use@0.2.0-rc.1`、`@deepseek-ai/dsh-mcp-client@0.2.0-rc.1`、`@deepseek-ai/dsh-mcp-resources@0.2.0-rc.1`、`@deepseek-ai/dsh-tools@0.2.0-rc.1`、`@deepseek-ai/dsh-skill@0.2.0-rc.1`、`@deepseek-ai/dsh-client-ui-sidebar-browser@0.2.0-rc.1` 等，均以本地已安装源码/类型/README 为准。**依赖闭包中不存在任何 `dsh-browser-use` 包**。
- 官方上游源码：`deepseek-ai/deepseek-harness` tag `dsh-v0.2.0-rc.1`（published 2026-09-28T12:36:21Z；GitHub API 于 2026-09-29 查询 tree 与 raw 文件），另核对 master tree。
- 官方 npm：`@deepseek-ai/dsh-browser-use`、`@deepseek-ai/dsh-experimental-browser-use-{playwright-mcp,chrome-devtools-mcp,stagehand-native,runtime}` 均为 `dist-tags: {latest: 0.1.6-alpha.1, alpha: 0.1.7-alpha.2, next: 0.2.0-rc.1}`；`@deepseek-ai/dsh-computer-use` 同为该三段 tag。
- 官方文档站（2026-09-29 抓取）：<https://deepseek-harness.github.io/deepseek-harness/reference/capability-seams> 的 seam 表中已列出 `ctx.browserUse` 与 `ctx.computerUse` 及各自 experimental providers；`/reference/subsystems/browser-use` 与 `computer-use` 在站点上为 404，仓库内则有 `docs/subsystems/browser-use.md`（链接到 GitHub 源文件）。
- 生态候选：`Tencent/BrowserSkill` main @ `f62e283cbb848118096491d1926d8714ebf05b8f`（2026-09-28），包 `packages/dsh-plugin-browserskill`；npm `@wxg-prc-cpg/browser-skill-dsh-plugin@0.3.1`（peerDependencies 均锁 `^0.1.5-rc.3`）。本文对其做 clone 级代码阅读，结论标注代码级 / README 级。
- 我们自己的 computer-use 先例（先读，用于对照）：`docs/adr/0050/0051/0052/0055/0058/0062/0063`、`0079`、`0080`、`0081`、`0082`、`0083`；`docs/research/2026-09-21-dsh-official-computer-use-and-cua-driver.md`、`2026-09-21-personabot-computer-and-live-view.md`、`2026-09-21-computer-use-vnc-persistent-login.md`；`packages/computer/src/tool/provider.ts`、`driver.ts`、`viewer.ts`；`packages/core/src/plugin.ts`。

## 结论摘要

1. **官方 DSH 0.2.0-rc.1 存在 browser use 能力，但形态是「一个实验性的独占 provider 注册槽」**：`ctx.browserUse`（`BrowserUseRegistry`）只登记一个 provider 名字，没有浏览器对象、操作 API、资源生命周期或模型可控选择器（上游 tag 的 `packages/browser-use/browser-use/src/index.ts`，代码级）。三个官方 provider（Playwright MCP / Chrome DevTools MCP / Stagehand native）属于 `packages/experimental/*`，以 npm `next` 渠道发布 `0.2.0-rc.1`，peer 版本与本仓库 pin 完全对齐（`cordis ~4.0.4`、`dsh-agent/tools/system-prompt 0.2.0-rc.1`），但**不在 `@deepseek-ai/dsh` 的依赖集内、不被随附 profile 挂载、也未安装进我们的树**；官方文档站的 capability-seams 表把它们标为 experimental。
2. **随附默认值里没有任何浏览器自动化工具**。`web`/`cordis`/`standard` preset 的模型工具只有 `web_search`/`web_fetch`（`dsh-tool-web`）；已安装的 `@deepseek-ai/*` 闭包内 grep 不到 `playwright`/`puppeteer`/CDP 实现。官方唯一的"浏览器"客户端包 `@deepseek-ai/dsh-client-ui-sidebar-browser@0.2.0-rc.1` 是**纯人类界面**：Web 用 sandbox iframe、Desktop 用 Electron `<webview>`，README 明确 "Model Experience: None … register no tool, prompt section, or Session event"，且 Web profile 默认禁用、仅 Desktop 启用。
3. **通用 MCP 通道是真实存在且随附的**：`dsh-mcp-client`（stdio + streamable-http，工具名 `mcp__<serverName>__<rawName>`）与 `dsh-mcp-resources`（共享的三个 resource 工具）都在 0.2.0-rc.1 依赖闭包内；这是"不改 DSH、跑任意浏览器 MCP server"的最低摩擦路径，但它是 composition 级注册（工具对整个进程可见），**没有原生的 per-PersonaBot 作用域**。
4. **官方 computer-use 仍然是我们已采用的 GUI 级 browser use 通道**：`ctx.computerUse` 单槽 + 我们自己的 `botharness-computer` provider 已把容器/本机桌面驱动、per-PersonaBot Access、session 级 Human Authorization、审计和查看器全部接好。BrowserSkill 那种 DOM 级语义它给不了，但"启动 Chrome、输入 URL、点击、观察"今天就能跑。
5. **BrowserSkill 是目前生态里完成度最高的第三方路线，且它的观察 UI 直接复用了 DSH 原生右侧栏的公开 seat**（`sidebarRightTabs.register` + `sidebarRight.openTabIn` + `sidebar.right.pane.tab(.title)` slot + `shell.overlay` 浮动后备），不依赖 `dsh-better-sidebar`。它的 `browser_*` 工具用 `ctx.tools.register` 注册为**全局工具**，靠"skill 被成功调用后才注册"做渐进暴露；lazy 揭示是**进程级、单向的**，没有 per-PersonaBot 作用域。
6. **版本耦合是 BrowserSkill 的硬约束**：其 peerDependencies 全部写 `^0.1.5-rc.3`（caret 语义下排除 0.2.x），开发基线是 DSH 0.1.5-rc.3 SDK；在 0.2.0-rc.1 上我逐项核对了它消费的关键 seam（`openTabIn`、`sidebarRightTabs`、`skills.register({resourceBase})`、`tools/result`、`session/created`）仍在，但它用来把 skill 重新注册进每个 agent 作用域的 `agent/session-start` 事件在 0.2.0-rc.1（以及 0.1.7-rc.2）的 agent 事件面里**不存在**（`agent/created|disposed|error|pre-step|request|request-error|status|turn-stopping|assistant-stream`），该路径会静默失效。
7. **给 PersonaBot 接入 browser use 的核心矛盾不是"有没有 seam"，而是"浏览器资源的所有权形状"**：官方 browser-use 的语义是 per-live-Agent/Session 的浏览器（launch 隔离 / attach 独占预留），而我们 Computer 的语义是 profile 共享单桌面 + per-Bot 窗口作用域（ADR-0083）。"每个 PersonaBot 一个登录态浏览器"在两种语义下都需要应用自定义的 router/资源层，官方单槽 seam 本身不管这件事（与 ADR-0079 对 computer-use 的结论同形）。

## 1. 官方 DSH 0.2.0-rc.1 到底有什么、没有什么

### 1.1 有：`ctx.browserUse` 独占 provider 注册槽（实验性）

上游 tag `dsh-v0.2.0-rc.1` 的 `packages/browser-use/browser-use/src/index.ts`（代码级，2026-09-29 抓取）：

```ts
export class BrowserUseRegistry extends Service {
  private registration: BrowserUseProviderName | undefined;
  get providerName(): BrowserUseProviderName | undefined {
    return this.registration;
  }
  register(name: BrowserUseProviderName): () => Promise<void> {
    if (this.registration !== undefined)
      throw new Error(`browser use provider "${this.registration}" is already registered`);
    return this.ctx.effect(() => {
      this.registration = name;
      return () => {
        this.registration = undefined;
      };
    }, 'browserUse.register()');
  }
}
```

- 服务"无配置、无 provider 选择器、无浏览器资源"；第二次注册（即使同名）直接抛错；provider 必须先停工具准入、关资源、等自有工作结束再释放（`packages/browser-use/browser-use/README.md` @ tag，README 级）。
- 语义明确写在官方 note `2026-09-12-browser-use-provider-registration.md`：浏览器资源属于**确切的 live Agent 与 Session**（不是可复用的 session id）；calls 跨轮保留状态；runtime disposal 关闭 launch 的资源，reload/fork 不继承；attach 模式把一个外部浏览器**在一个 provider 实例内独占预留给一个 Session**，cleanup 只断开不关闭外部浏览器；cancellation 不回滚已投递的浏览器动作。

### 1.2 有：三个实验性 provider（npm `next`，peer 与 pin 对齐）

| provider 包（npm）                                                         | 依赖                                                                            | 机制（代码级/README 级）                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp@0.2.0-rc.1`      | `@playwright/mcp@0.0.80`                                                        | 以 `process.execPath` 启动 pinned `@playwright/mcp/cli.js`，`--browser chromium`；launch 传 `--isolated [--headless] [--executable-path]`，attach 传 `--cdp-endpoint <endpoint>`，`exclusive = (mode === 'attach')`，经 `mountSessionMcp` 把上游工具注册进每个 live Session 作用域（`packages/experimental/browser-use-playwright-mcp/src/index.ts` @ tag，代码级） |
| `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp@0.2.0-rc.1` | `chrome-devtools-mcp@1.9.0`                                                     | 同类 MCP 形态，Chrome DevTools inspection/control（README 级）                                                                                                                                                                                                                                                                                                      |
| `@deepseek-ai/dsh-experimental-browser-use-stagehand-native@0.2.0-rc.1`    | `@browserbasehq/stagehand@4.1.0`、`@puppeteer/browsers@3.2.2`、`dsh-mcp-client` | native browser 操作 + AI-assisted act/find/extract；需要显式配置的原生模型 API key（OpenAI/Anthropic/Google/Groq/Cerebras；DeepSeek endpoint 不支持），`@puppeteer/browsers` 先落地 Chromium/临时 profile，isolated Worker 经 CDP 连接（README 级）                                                                                                                 |
| `@deepseek-ai/dsh-experimental-browser-use-runtime@0.2.0-rc.1`             | —                                                                               | per-Session 资源所有权 + attach 独占预留 + `mountSessionMcp`（在 `agent/created` 内 await 一次 MCP 连接与工具发现；busy attachment 永久跳过该次激活；startup 失败回滚 Agent 创建）（README 级）                                                                                                                                                                     |

关键事实（npm registry 2026-09-29 查询，metadata 级）：

- 这些包 `dist-tags.next = 0.2.0-rc.1`，`latest` 仍停在 `0.1.6-alpha.1`——**官方把它当实验能力，未进稳定通道**。
- peerDependencies 与本仓库 pin 精确对齐（`@deepseek-ai/cordis ~4.0.4`、`@deepseek-ai/dsh-agent 0.2.0-rc.1`、`dsh-tools 0.2.0-rc.1`、`dsh-browser-use 0.2.0-rc.1`、`dsh-system-prompt 0.2.0-rc.1`）——**可以安装到我们的 0.2.0-rc.1 Host，但这不改变它 experimental 的地位**。
- `@deepseek-ai/dsh-browser-use` 不在 `node_modules/@deepseek-ai/dsh/package.json` 的 82 个 dependency 里；`dsh-base`/`dsh-web-app` 的 `cordis.patch.yml`（本地 0.2.0-rc.1 安装副本）也没有 browser-use 行。即：**官方能力存在，但随附 profile 默认不提供**。

### 1.3 有：官方人类侧 Sidebar Browser（纯展示，非 agent 能力）

`@deepseek-ai/dsh-client-ui-sidebar-browser@0.2.0-rc.1`（本地安装副本，README 级）：

- "Sandboxed Web browser tabs for the right Sidebar"；Web 用 app 管理历史的 iframe，Desktop 用 Electron `<webview>`（原生导航历史、页面保留），从不向访问内容注入 Electron/Node 权限。
- "**Model Experience: None**, as Browser tabs are user-facing presentation state and register no tool, prompt section, or Session event." KV Cache effect 也为 none。
- Web profile 默认禁用：`dsh-web-app/cordis.patch.yml` 中 `ui-sidebar-browser` 的 `disabled: ctx.get('profileContext')?.name !== 'desktop'`（本地安装副本 278–280 行，代码级）。Desktop profile 才默认开启。
- 客户端插件可以 `ctx.sidebarRight.openTab('browser', { params: { url } })` 打开一个 Browser tab（README 级）——它是**展示任何 HTTP(S) 页面的通用 seat**，不感知 agent 状态。

### 1.4 有：通用 MCP 客户端 / resources 与 web 工具

- `@deepseek-ai/dsh-mcp-client@0.2.0-rc.1`：每 server 一个 config entry，`transport: stdio | streamable-http`；stdio 直接 spawn（不经 shell），工具名 `mcp__<serverName>__<rawName>`（稳定、不随 HMR/HMR 重命名）；工具注册在 `ctx.tools`，另有 `createMcpToolDefinition(ctx, options)` 导出给"自带 MCP 连接的调用方"自行注册（`lib/types/tools.d.ts:94-101`，代码级）；重连退避、进程退出降级都有定义。
- `@deepseek-ai/dsh-mcp-resources@0.2.0-rc.1`：`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource` 三个共享工具，随附 profile 已挂载；server 在"调用 agent 的作用域"内解析。
- `dsh-tool-web`：`web_search` + `web_fetch`（HTML 转 markdown、untrusted 标记），是随附 preset 里唯一的 web 能力。
- 作用域事实（代码级）：`dsh-tools` 提供 `ctx.tools.register`、`ctx.tools.restrict(filter)`（per-agent allow/deny mask，"scoped registrations stay visible"）、`tools/pre-execute|execute|post-execute|result` 事件；`dsh-skill` 提供 host+per-scope 分层的 `ctx.skills.register`（含 `resourceBase`，0.2.0-rc.1 类型已确认）与 `dsh-tool-skill` 的按需加载。

### 1.5 没有：这些不要臆造

- **没有随附的 `browser_*` 工具**：`@deepseek-ai/dsh` 依赖闭包与 shipped preset 均无浏览器操作工具；`grep -r "playwright|puppeteer"` 在本安装树的 `@deepseek-ai/*` 库内零命中。
- **没有"每个 PersonaBot 一个浏览器"的原生机制**：官方 browser-use 的 per-Session 资源属于 provider/实验 runtime；服务本身只有一个名字槽。
- **没有官方 browser-use 的 Client/UI**：官方右侧栏 Browser tab 不认识 agent 浏览器 session（无 tool、无 SessionEvent）；BrowserSkill 的实时缩略图是自己的 client 插件 + 自有 HTTP route 实现的。
- **没有官方 Extension/CDP 的"用户已登录浏览器"能力**：官方 provider 的 attach 是"把一个 CDP endpoint 独占给一个 Session"，不提供浏览器扩展通道；"复用真人登录态、非独占借用 tab"是 BrowserSkill 的差异化能力。
- **没有 stable 通道**：三个 provider + service 的 `latest` tag 仍是 `0.1.6-alpha.1`。
- 证据缺口（明示）：以上 provider 的**实际工具目录**只读到 README/metadata，未逐行读其源码（除 playwright-mcp 的入口与 npm 依赖版本）；没有做任何端到端 live 验证。

## 2. 给 PersonaBot 接入 browser use 的四条现实路径

### 2.1 (a) 插件自注册原生工具 + skill 门控（BrowserSkill 路线）

**seam 与机制**（均为代码级，仓库 main @ `f62e283`）：

- 工具面：`registerBrowserTools` 用 `ctx.tools.register(defineTool(...))` 注册六个全局工具 `browser_session` / `browser_page` / `browser_inspect` / `browser_interact` / `browser_tabs` / `browser_assist`，每个工具用 `action` 枚举分派到私有 operation handler（`src/browser-tools.ts:377-385`、`src/tools.ts`）。每次调用 spawn 一个 `bsk <cmd> --json` 子进程并解析 JSON（`src/runner.ts:1-10`；`exec.signal` 杀子进程；timeout/错误 envelope 有结构）。
- skill 门控：`ctx.skills.register({name, description, content, source:'bundled', resourceBase})` 注册内嵌 `browser-skill`（catalog 常驻、body 按需），并用 `agent.ctx` 对每个 agent 重复注册以压过 preset 文件系统层（`src/skill.ts:41-59, 75-110`）；`lazyTools: true` 时六个工具 schema **直到 skill 成功调用才注册**，触发面覆盖 `tools/result`（模型 `skill` 调用成功）、`session/event`（`/browser-skill` 手势的 skill-invocation 消息、`turn/start` 重试）、`session/created` + `ctx.inject(['sessions'])`（resume 历史回扫 `tool/call`+`tool/result`/旧扁平 callId 形状），揭示后全进程单向生效（`src/lazy-tools.ts:152-269`）。
- 观察面：client 半边 `ctx.slots.inject('tool.call.toolview', key: 'browser_inspect')` 提供截图卡片；`ctx.slots.inject('shell.overlay')` 浮动观察；若 host 提供 `sidebarRight`+`sidebarRightTabs`，则注册原生右侧栏 page type（id `@wxg-prc-cpg/browser-skill-dsh-plugin/observation`、kind `browserskill-observation`、guide order 60），用 `sidebarRight.openTabIn(sessionId, kind)` 打开、`slots.register('sidebar.right.pane.tab'/.title')` 渲染（`src/client/index.ts:68-100`、`src/client/observation-sidebar.tsx:156-330`）。
- 数据面：host 侧用 `webServer.register` 暴露 `/bsk-observation/{state,events(SSE),interrupt,stop,thumbnail/:id}`，并复刻 DSH `/api` 的 loopback trust fence（Host 必须是 loopback、Origin 必须同 Host、`sec-fetch-site: cross-site` 拒绝、POST 必须 `application/json`）；注释明确"dsh 0.1 的 Typert Remote pipeline 与 forwarded-event allowlist 对树外包关闭"（`src/observation-http.ts:1-90`，代码级）。
- 会话所有权：插件只管理自己 `browser_session start` 创建的 session；`session` 参数可指向 owned session，省略即"当前 session"（最近 start/use 者）；结果回显实际 session；`maxSessions` 默认 5；start 先写 journal 再开窗，stop 保留目标与 cleanup intent 可重试；卸载停掉所有 owned session、杀掉 in-flight bsk（README + `src/session-starts.ts`/`start-journal.ts`，README 级 + 代码级混合）。
- screenshot 结果走 host attachment store + 当前路由 image input 双重门控，否则返回 PNG path（`docs/development.md`，README 级）。

**代价/权衡**：

- **所有 PersonaBot 共享全局工具注册**：lazy 揭示是进程级、单向、无 per-Bot 撤销；PersonaBot 隔离只能靠应用自定义的 `tools/pre-execute` 分类器/审批或 per-agent `tools.restrict` 补丁（BrowserSkill 自己没有）。
- **观察面是自建传输**：SSE + plugin HTTP route + loopback fence；不能在 LAN/反代后工作（文档明说 deliberately fail）。我们的 BotHarness 已有"认证 host route + 同源面板"的先例（`packages/computer/src/viewer.ts`），可替代。
- **登录态与隔离是 BrowserSkill 的原生卖点**：Agent Window 共享所选 Chrome profile 的登录态，"not a separate account or security sandbox"；真人可在 Agent Window 里接管登录/验证（`request-help`、borrow/return tab）。这与我们的容器隔离取向相反，需要明确选择。
- **版本耦合**：peer `^0.1.5-rc.3`；`agent/session-start` 在 0.2.0-rc.1 不存在（见 §3.4）；本仓库升级 DSH 时该插件不可假定兼容。
- 依赖 `bsk` CLI + Chrome/Edge 扩展 + daemon；扩展走浏览器商店，企业环境分发是运维问题。

### 2.2 (b) MCP 路线（官方通用 seam，已确认存在）

**b1. 挂官方 `dsh-browser-use` + 实验 provider**（最"官方"但实验）：

```yaml
- name: '@deepseek-ai/dsh-browser-use'
- name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
  config: { mode: launch, headless: true } # 或 mode: attach, endpoint: <CDP URL>
```

- 机制：provider 在 `agent/created` 里 await 一次 MCP 连接与发现，把上游工具注册进**每个 live Session 的作用域**；launch 隔离、attach 独占预留、Session 释放时断开；工具走正常 DSH 执行管线与 Session log（README 级；playwright 入口代码级）。
- 代价：整个 Host 只能有**一个** provider 实例/名字（单槽），launch 无法表达 per-PersonaBot 的浏览器目标选择；attach 是"CDP endpoint 独占"而非"每个 Bot 自己登录态"；`latest` 仍是 alpha；Stagehand 额外要求非 DeepSeek 的模型 key；launch 的 Chromium 装在 Host（或容器，取决于 Host 所在），与我们的容器边界需要单独设计。

**b2. 直接挂 `dsh-mcp-client` entries**（不引入 browser-use 服务）：

```yaml
- id: mcp-chrome
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    {
      serverName: chrome,
      transport: stdio,
      command: npx,
      args: ['-y', '@playwright/mcp@...', '--headless'],
    }
```

- 机制：官方通用 MCP 客户端；工具 `mcp__chrome__<tool>`；重连/超时/图片门控都有。
- 代价：这是 **composition 级全局注册**——工具对所有 agent 可见，没有 per-PersonaBot 作用域；要表达"只有 Access 打开的 PersonaBot 看得见"必须再加应用层（见 b3）。

**b3. 自建 router/provider（我们 computer 的形状）**：用 `@modelcontextprotocol/client` 的 `StdioClientTransport` 连任意浏览器 MCP server（本地/`docker exec -i`），用 `createMcpToolDefinition(scope, ...)` + `scope.tools.register(...)` 注册进**该 PersonaBot 的 agent scope**——这正是 `packages/computer/src/tool/provider.ts:205-287` + `driver.ts:145-170` 已经验证过的形状。代价：我们拥有连接生命周期、工具编目、内容门控与审计；收益：per-Bot 工具可见性、审批、审计完全沿用现有机制。

### 2.3 (c) 走既有官方 `ctx.computerUse` provider（GUI 级，零新 seam）

- 现状（代码级，本仓库）：`botharness-computer` 已占用唯一 `computerUse` 槽（`packages/computer/src/tool/provider.ts:349-355`），把 Cua Driver 的 curated observe/act/verify 工具注册到 Access=on 的 PersonaBot session scope（同文件 205-287），并已接好 Human 一次性授权（`packages/core/src/plugin.ts:492-539` 的 `tools/pre-execute` + `ctx.approval`）、redacted 审计（`computer-audit` → `logs.db`）与 VNC/Selkies 查看器（`viewer.ts`）。
- browser use 的含义：在 Computer 桌面里打开 Chrome，用 `launch_app`/`get_window_state`/`click`/`type_text`/`verify_state` 操作；Chrome 窗口作为"Bot Screen"窗口之一被 window-scoped 归属（ADR-0083），per-Bot display 是实验 opt-in。
- 代价：**没有 DOM/网络语义**（AX 树 + 像素；输入级脆弱）；Xvnc/Xvfb 下 driver 的背景 raw-pixel（MPX）不可用、需 AT-SPI/foreground（`docs/research/2026-09-21-dsh-official-computer-use-and-cua-driver.md` 结论 7）；容器内 Chrome 与用户本机登录态无关；一次只能一个人/Bot 用前景（顺序工作面）。
- 收益：今天就能跑，授权/审计/观察/停启/导出全部复用；不动 DSH 版本也不新增依赖。

### 2.4 (d) Extension / CDP 级自动化

- **BrowserSkill（extension + `bsk` daemon）**：见 §2.1；最强的登录态/真人接管语义，但版本与作用域代价如上。
- **官方 CDP attach**：`playwright-mcp`/`chrome-devtools-mcp` 的 attach 模式以 `--cdp-endpoint`（HTTP/WS）连一个已开 remote debugging 的浏览器；独占预留一个 Session；适合"容器里 run 一个带 CDP 的 Chromium，多个 Bot 各自 launch 隔离环境"或"显式把一个外部浏览器给一个 Session"。
- **raw CDP / playwright-core 自研**：社区已有 `dsh-plugin-browser-use`（playwright-core、npm 0.3.1）、`dsh-playwright-browser`、`dsh-playwright-ag`（patchright）等；自己写则完全不依赖 DSH 浏览器 seam，只依赖 `ctx.tools` + 自己的进程/连接管理。容器内是否需要 `playwright-core` 浏览器二进制、是否复用 webtop 的 Chromium、以及 CDP screencast 作为观察通道，均需实测（证据缺口）。
- 说明：官方 sidebar-browser tab 可以显示任何 HTTP(S) 页面，因此"CDP screencast 自建网页"或"noVNC 页"都可以嵌在原生右侧栏里做观察面——这是唯一被官方 browser tab 允许的耦合方式（它不感知 agent 状态）。

### 2.5 横向对比

| 维度                  | (a) BrowserSkill 插件                                         | (b1) 官方 browser-use + provider                          | (b2) dsh-mcp-client           | (c) computerUse(GUI)                          |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- | --------------------------------------------- |
| seam                  | `ctx.tools.register` + `ctx.skills` + `ctx.slots`/`webServer` | `ctx.browserUse`（单槽）+ per-Session MCP                 | `ctx.tools`（composition 级） | `ctx.computerUse`（单槽，已占用）             |
| per-PersonaBot 作用域 | 无（全局工具）                                                | provider 按 live Session 绑定，但激活是全局的；单实例     | 无（全局）                    | **有**（per-Bot Access → session scope 注册） |
| 授权/审批             | 插件无 approval（`request-help` 是人机协作，不是审批）        | 无（provider 不拥有 workflow；官方 note 明说）            | 无                            | **有**（session 级 Human Authorization）      |
| 审计                  | 插件自身 operation audit（opt-in，daemon 侧）                 | DSH Session log 里是普通工具结果                          | 同左                          | **有**（redacted Computer Audit → logs.db）   |
| Web UI 观察           | 原生右侧栏 tab + 浮动面板 + SSE                               | 无官方 UI                                                 | 无                            | **有**（认证 route + 面板，Selkies）          |
| 多会话并发            | owned sessions，`maxSessions` 5，"current session"语义        | per-Session 资源 + attach 独占预留                        | 取决于 server                 | profile 共享桌面、窗口级归属，顺序工作        |
| 隔离/安全             | 共享真人浏览器登录态；loopback fence；扩展商店分发            | launch isolated 或 attach 独占；无 fence 需求（本地进程） | 取决于 server                 | 容器/本机桌面隔离；审批 + 审计                |
| 版本耦合              | peer `^0.1.5-rc.3`；`agent/session-start` 在 0.2.0-rc.1 缺失  | 包版本与 pin 精确对齐，但 npm `next`/experimental         | 与 pin 对齐                   | 与 pin 对齐，已采用                           |

## 3. 映射到我们已有的 computer-use 模式

### 3.1 完全可复用的机制

- **profile 级共享资源 + per-PersonaBot Access**（ADR-0051/0080）：`packages/computer/src/tool/provider.ts:358-375` 的 `attachAgent` 只给 Access=on 的 Bot 注册工具，`reconcileBot` 在开关变化时增删注册；browser use 可以直接照抄这个"资源是 profile 的、使用权是 Bot 的"分层。
- **session 级一次性授权**（ADR-0080）：`needsAuthorization`/`markAuthorized` + core 的 `tools/pre-execute` 分类器 + `ctx.approval.request`（`packages/core/src/plugin.ts:492-539`）；browser 工具只要能被 `ownsTool` 识别，就走同一条 Bot DM 审批卡（含 one-time/always 规则）。
- **审计**：`ComputerAuditEvent` 的 redacted summary 模式（`provider.ts:129-143`）；浏览器动作的审计同样可以不含截图与输入正文（BrowserSkill 的 operation audit 也是"排除 input values、page bodies、screenshots"的同款克制）。
- **live 观察**：`packages/computer/src/viewer.ts` 的"host 路由 + scrub framing headers + WS upgrade 转发"是通用做法；BrowserSkill 证明了另一条合法路线——用 `sidebarRightTabs`/`openTabIn` 注册**原生右侧栏 tab**，配 `sidebar.right.pane.tab` slot + 自有 SSE。两条路都真实存在，不冲突。
- **工具编目**：`catalog.ts` 的 curated core + 渐进发现（ADR-0079）对浏览器同样适用（六工具 action 分派是另一种已验证形状）。

### 3.2 需要应用自定义 router/provider 层的部分（明确标注）

- **若采用官方 `ctx.browserUse`**：服务只有一个名字槽，且 provider 的激活是全局的（`agent/created` 时对每个 live agent 生效）。要表达"只有某些 PersonaBot 有浏览器"、"每个 Bot 用哪个浏览器 target（本机/容器/扩展）"，就需要**一个 BotHarness 自己的 router provider**：内部持有 PersonaBot→浏览器资源的注册表与租约，再把工具按 session scope 注入——与 ADR-0079 给 `computerUse` 的结论完全同形（"每个 PersonaBot 一台电脑"无法用单槽直接表达）。官方 experimental runtime 库提供 per-Session 资源与 MCP 挂载原语，可以借用，但它不解决 per-Bot 授权/目标选择。
- **若采用 BrowserSkill**：它的工具是全局的、lazy 揭示不可按 Bot 回收。要满足我们的授权模型，需要应用层在 `tools/pre-execute`（或包装工具注册）里按 ownership 做 per-Bot 门控；这不是官方 seam 的义务，是我们自己加的分类器。它没有 `ctx.approval` 集成，也没有 logs.db 审计。
- **若采用 `dsh-mcp-client`**：composition 级全局注册没有 per-Bot 作用域；只有走 b3（自建 provider + `createMcpToolDefinition(scope, ...)` + agent scope 注册）才能获得与 Computer 一样的可见性边界。
- **观察与传输**：官方 browser-use 不带 UI；BrowserSkill 的 UI 是自建 SSE + loopback fence，不能用于我们的 LAN/远程场景。BotHarness 需要自己的观察端点（认证 host route 或原生 sidebar tab + 我们已认证的传输）。

### 3.3 真正开放的问题（不要假装已有答案）

- **浏览器资源的语义**：profile 共享一个"带登录态的浏览器"（BrowserSkill/attach 语义）还是 per-Session 隔离浏览器（官方 launch 语义）？两者对"Access 意味着什么、Authorization 保护什么、审计归属谁"的答案不同。ADR-0083 已经为"per-Bot display"记下同样的矛盾（per-Bot Chrome profile 不共享 cookie；共享登录态要么 CDP 同步要么放弃）。
- **真人接管/登录**：BrowserSkill 把"Agent Window + request-help + borrow/return tab"作为产品能力；我们的 Computer 有 Selkies 人看/人控，但没有"人类在 agent 浏览器里完成登录后继续"的流程。browser use 是否要求同款？
- **工具面与审批粒度**：六个 action 分派工具 vs 上游 MCP 全目录（Playwright MCP 目录不小）；per-action 授权还是 session 授权；`browser_inspect` 的截图/网络内容是否进入审计/日志的边界。
- **并发与预算**：多 Bot × 多 session 的浏览器数量、内存（ADR-0083 已测 Chromium ~200–230 MB/个）、idle 回收、与容器 2 GB 预算的关系。
- **版本策略**：官方 browser-use 还在 `next`（0.1.6-alpha 为 `latest`），我们是否允许 experimental 依赖进产品（ADR-0079 对 computer-use 的答案是"不"）；BrowserSkill 的 peer 范围排除 0.2.x，能否在 pin 上实际运行只有部分机制核对（§3.4）。

### 3.4 版本耦合实测（针对 pin 的 0.2.0-rc.1）

- 存在：`sidebarRight.openTabIn`（`dsh-client-ui-sidebar-right@0.2.0-rc.1` 类型 `client/service.d.ts:270`）、`sidebarRightTabs.register({id,kind,title,guide})`、`sidebar.right.pane.tab(.title)` slots、`skills.register({resourceBase})`（`dsh-skill` 类型 `index.d.ts:60`）、`tools/result`（`dsh-tools` 类型 `index.d.ts:92`）、`session/created`（`dsh-session@0.2.0-rc.1`）。
- 不存在：`agent/session-start`（0.2.0-rc.1 与 0.1.7-rc.2 的 `dsh-agent`/`dsh-agent-loop` 事件面均无此名字）——BrowserSkill 用它把 DSH 版 skill 注册进每个 agent scope，在 pin 上会静默不生效（仍会走全局 skill 与 `agent.ctx` 已有 agent 的即时注册路径）。
- 未验证：`ctx.get('sessions')`、`snapshotEvents()`/`events` 的具体形状、attachment client 契约（BrowserSkill 开发基线 0.1.5-rc.3）在 0.2.0-rc.1 的逐项兼容；没有做端到端运行。

## 4. 对我们的含义 / 待 grill 的问题

**含义（一句话）**：官方答案不是"没有 browser use"，而是"有实验性单槽 seam + 实验性 MCP providers，且与我们的 pin 对齐但默认不装"；生态里 BrowserSkill 是最完整的第三方实现，它的观察 UI 证明了原生右侧栏 seat 可用，但它的全局工具注册、无审批、共享登录态与 peer 范围，和我们已有的 per-PersonaBot 授权/审计/容器模型都需要一个应用自定义的 router/资源层来桥接。

**待 grill 的问题**：

1. PersonaBot 的 browser use 第一目标是什么：**a.** 复用真人已登录浏览器（BrowserSkill/扩展路线）还是 **b.** 容器内隔离浏览器做可复现自动化（Playwright/CDP 路线）？还是两者是两个产品能力？
2. 采用官方 `ctx.browserUse` + 实验 provider，还是自建 provider/完全不碰该 seam？（单槽 + experimental 是最重的两个论据；但 peer 版本对齐意味着"现在能装"）
3. per-PersonaBot 的 Browser Access 在"per-Session 隔离浏览器"语义下代表什么——工具可见性？资源预留？登录态归属？Authorization 的第一次动作审批是否沿用 computer 卡？
4. 共享登录态：允许多 Bot 共用一个浏览器 profile（并发/串扰/审计归属风险）还是每 Bot 独立 profile（登录缺失）？CDP 同步 cookie 是否是可接受的技术债？
5. 观察面选哪条：原生右侧栏 tab（BrowserSkill 先例，需要 `sidebarRightTabs`+自有 SSE 或复用认证 host route）、还是 Channel sidebar 里的自建面板（computer viewer 先例）？LAN/远程是否必须支持（BrowserSkill 的 loopback fence 排除）？
6. 审计边界：browser 动作的 URL/DOM 文本/截图哪些进 `logs.db`？screenshot 是否只做 model attachment（computer 的既有规则）？
7. 并发/资源预算：`maxSessions`-类上限、idle 回收、与容器内存/CPU 的关系；是否需要"按需启动、用完即停"的 tracer bullet。
8. 版本与发布：是否接受 experimental npm 依赖（对照 ADR-0079 的拒绝）；BrowserSkill 作为生态候选是"直接推荐安装"还是仅取模式自建（对照 ADR-0011/0015 的边界）。
9. 归属：browser use 是进 `@botharness/computer`（作为 Computer 的一个能力）还是独立 `@botharness/browser` 包（对照 ADR-0050 的包边界与实验 opt-in 先例）。

## 附录：扩展路线机制核对与决议去向（2026-09-29）

决议后补核对了"扩展借 Human 日常浏览器"路线的机制（§2.1/§2.4 的候选）；以下为官方文档 / Chromium 源码级核对（除注明外）：

- **装载**：没有商店时官方通道是"解压目录 + Load unpacked"（zip 不能直接加载；Windows/macOS 自 Chrome 33/44 起禁用本地 `.crx` 拖入安装）。Chrome 133/134 起，未打包扩展只在开发者模式开关打开时启用；Chrome 137 移除 `--load-extension`；企业策略（`ExtensionDeveloperModeSettings`、`ExtensionInstallBlocklist` 等）可整体禁止。
- **调试能力**：`chrome.debugger` 按 tab 附加，可发送固定白名单 CDP 域（Page/DOM/Input/Network/Target 等），MV3 service worker 可用；附加会在浏览器顶部显示 "… started debugging this browser" infobar，且与打开的 DevTools 互斥；后台标签需 `Emulation.setFocusEmulationEnabled` 后才稳妥派发输入，`Page.captureScreenshot` 在后台标签可能因不产合成帧而失败。
- **传输**：浏览器沙箱不允许扩展启动本机进程，连接必须由扩展发起；BrowserSkill 实测形状为"扩展作 WebSocket client 连 `ws://127.0.0.1:52800` + 强制握手 + 30 秒 alarms 保活"（其源码），native messaging 更稳但要为每个浏览器注册 host manifest（Windows 还需写注册表）。
- **更新**：未打包扩展不会自动更新，升级需用户手动 Reload 并保持开发者模式开启。

这些代价与收益的取舍记录在 ADR-0088 的 Considered options：扩展路线被记为 **deferred**（不是否决）；最终决议为 ADR-0088/0089/0090，交付切片见 hub #459。
