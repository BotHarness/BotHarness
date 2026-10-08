# 验收 UI 前主动读取 Client 启动诊断

每次启动隔离 DSH、重建／重载 Client，以及执行改变页面的交互后，都由 agent 主动读取真实浏览器 console 和 DOM，不等 Human 复制报错。

```bash
node scripts/dev-instance.mjs --home <isolated-home> --port <port> --json > <private-launch.json>
node scripts/dev-client-diagnostics.mjs --launch <private-launch.json>
```

启动文件包含本机登录 token，必须保密。读取器只接受 loopback HTTP 登录地址，在内存中认证，不输出 URL 或 cookie。`--attempt <uuid>` 可固定失败文档；后续成功不会擦掉先前 attempt。

| 状态               | 含义                                         | 退出码 |
| ------------------ | -------------------------------------------- | ------ |
| `unobserved`       | Host 尚未收到浏览器报告                      | 2      |
| `starting`         | 观察器已装载，尚未确认 shell                 | 2      |
| `shell-ready`      | 已提交且可见的 BotHarness 导航按钮通过帧检查 | 0      |
| `failed`           | 观察到异常、shell 消失或前台启动超时         | 1      |
| `stale` / `closed` | 证据过期或文档已离开                         | 2      |

退出码 0 只证明这一项 shell 观察；数据、输入框和模型可用性仍需真实交互。后台标签可能暂停绘制，因此延后前台启动计时；计时器延迟保留真实 elapsed time。`/api` 返回 200 不能替代 UI 验收。

使用 CUA 时，在启动和每个相关动作后读取 `tab.dev.logs({levels:['error','warn'],limit:50})` 与 `tab.playwright.domSnapshot()`，再保存结构化报告。对照首个**观察到的**错误、事件顺序、遗漏计数与证据时效；它是线索，不自动等于因果根源。浏览器控制超时／断连要单独记录，先观察动作是否已执行，再决定重试。`net::ERR_BLOCKED_BY_CLIENT` 是导航拒绝，不能声称测试页已执行。认证测试页还须单独检查原生 admission：固定 RC1 即使收到有效 cookie，也会拒绝 cross-site 请求并返回 403；已验证从应用内可见同源链接进入可通过，保留原生安全边界。任务要求 CUA 时不可换浏览器驱动绕过。

建立能触发原症状的反馈循环，每次只改变一项；仅重启精确归属本任务的 Host 并显式重载。保留首次失败和每次重试，不吞异常、不无限刷新、不改动配对 Profile 换取绿色。完成条件是原回归通过、真实 DOM 能执行目标行为、当前 console 没有无法解释的新错误；原生原因无法在本仓库安全修复时交接固定版本源码、最小复现与未确定归属。

Host 的 application-defined collector 用原生 `webServer.tapIndex` 在第一个脚本前安装观察器，覆盖 BotHarness Client 尚未导入的阶段；监听 `error`（含资源失败）、`unhandledrejection`、`console.error` 和已知原生 warning。原 console 仍收到调用，不 `preventDefault`，不自动重载。只发送固定 code、source、attempt UUID、序号和 elapsed time；未知异常归为 `unclassified-exception`，不发送原始消息、stack、URL、Session ID、页面内容或凭据。

`GET/POST /api/botharness/client-diagnostics` 使用现有 Connection Fetch 精确认证路线，不另占 `/api` interceptor；报告只是过程证据。浏览器保留开头 16 条和最近 48 条，首个失败与 shell 挂载记录独立固定并记录遗漏数；Host 保留 20 次文档 attempt，记录淘汰数。读取器默认按文档启动时间选择最新 attempt，旧后台页面迟到的报告不会覆盖新文档。合并短请求，10 秒心跳、不新增 SSE，连续四次发送失败后停止。35 秒以上的旧报告不能证明健康。普通 Profile 仅在 `BOTHARNESS_CLIENT_DIAGNOSTICS=1` 时启用；AX helper 默认启用，可用 `--no-client-diagnostics` 关闭。

事件按顺序复用 ADR-0063/0064 的 `logs.db`、`client-diagnostics` plugin 与 `client-observation` kind，trace 指向 attempt，沿用保留上限且不进入备份。持久化失败明确报告但不阻断启动；Host 重启后实时端点为空，旧证据通过既有数据库只读查询。Fiber 清理路线、HTML transform 和日志连接，文档清理监听／计时器／console wrapper。完整查询与限制见 [English guide](client-startup-diagnostics.md) 和[日志读取](reading-operational-logs.md)。

核验版本为 DSH `0.2.0-rc.1`，revision [`4878cdabd87d4041bdaff61d04c966883b9fd07a`](https://github.com/deepseek-ai/deepseek-harness/tree/4878cdabd87d4041bdaff61d04c966883b9fd07a)。共享 reference checkout 可能更高，用 `git show` 读取固定 tag，不切换其他任务的 checkout。

```bash
pnpm exec vitest run packages/client/test/native-startup-repro.test.ts
```

测试加载实际安装的官方浏览器 artifact。在注册 root、取得渲染树、撤销注册后通过真实 React DOM 渲染，可精确触发原生 `RootOutlet` 的 `renderSlot('root') before any 'root' registration (boot order)`；从未注册就直接调用 `renderSlot` 会触发另一条同步 guard，不能混淆。实际 `UiConversation.binding` 读取不存在的 Session 可触发第二条错误。源码中 locale 的 `refreshViews` 按 Session ID 遍历 tracked bindings，是待查生命周期候选，未证明原 QA 的实际因果。

这些最小 guard 复现不证明原 Profile 的触发动作或上游缺陷。谁撤销 root、locale 与 Session 销毁的真实时序仍未确定；未 patch 上游，也未削弱 guard。验收与剩余范围见 [#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184)。
