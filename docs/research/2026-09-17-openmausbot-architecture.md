# OpenMausBot 架构调研（2026-09-17）

| 项               | 内容                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库             | https://github.com/milind-soni/OpenMausBot                                                                                                                                                  |
| 版本             | `openmausbot@0.1.83`（`reference/openmausbot/package.json:3`）                                                                                                                              |
| Pin 的 commit    | `b054afda144436bc797ee7bbedfc38ce54938cbc`（2026-09-17 07:28:56 +0000，`fix(test): keep the Codex fake dependency-free — inline its atomic dump write (#1388)`）                            |
| 本地克隆         | `reference/openmausbot`（`git clone --depth 1`，仓库根 `.gitignore` 已忽略 `reference/`，未 commit；未执行 install/build/run）                                                              |
| 许可             | Apache-2.0，`enterprise/` 例外（source-available，见 `reference/openmausbot/LICENSING.md:1-9`、`reference/openmausbot/enterprise/LICENSE:1-12`、`reference/openmausbot/README.md:388-394`） |
| 方法             | 先读 README + `docs/`，再读 `server/`、`shared/`、`src/`、`electron/`、`companion/`、`third_party/`；全部结论以仓库内一手文件行号引用；无法从源码/文档确认的标 **未验证**                   |
| 与我们对照的规格 | `docs/botharness.md`、`PRD.md`、`docs/adr/0001–0018`、`docs/architecture/botharness-architecture.md`                                                                                        |

> 说明：本报告是 BotHarness/DeepSeekBot 的竞品调研（Grok Bot 类产品），文中「我们」指本仓库；adopt/adapt/reject 只做决策输入，不替代 ADR。

## 1. 定位

- 自我定位：Grok Bot 启发的独立开源项目，本地优先的「聊天应用里的 AI 团队」；每个 sidebar 里的 Bot 都是本机 `claude`/`codex`/`grok` CLI 上的真实 agent，各有性格、模型、云电脑与已连接应用（`reference/openmausbot/README.md:7-13,59-72`）。
- 与 Grok Bot 的关键差异：BYO agent（用本机已有的登录/订阅，不设代理），harness 只跑在 `127.0.0.1`，transcripts/keys/events 都在 `~/.openmausbot`（`README.md:64-72`）。
- 与 xAI 无关联；产品定位里明确 "Not affiliated with xAI"（`README.md:9,400-402`）。

## 2. 技术栈与拓扑

- 语言/框架：TypeScript strict、React 19、Electron 43、Vite 7、Tailwind 4（`README.md:15-18`；`package.json:41-62`）。Node ≥24、pnpm 10.33.0（`package.json:16-18`）。
- 进程模型（README 明示「两个进程」）：React 应用自身零传输层，通过 HTTP 发类型化命令、把**一条 SSE 事件流**折叠进本地状态；harness server 独占所有 agent 进程，把每个 provider 的原生协议归一化成统一的 canonical runtime event 流，并按 thread 落 NDJSON 日志（`README.md:179-205`）。
- 拓扑：App（5199）→ HTTP 命令 + SSE ← Harness（127.0.0.1:8799）→ 本机 CLI / Box 云电脑 / Composio Session（`README.md:185-205`）。分层表见 `README.md:207-214`。
- Monorepo 形态：根包即 server+app（`package.json:4-14`），pnpm workspace 额外包含 `apps/docs`、`cloudflare/control-plane`（`pnpm-workspace.yaml`）。

## 3. 运行时 / Driver 层（重点 A）

### 3.1 Driver SPI

- `server/contracts.ts` 是 SPI 唯一入口，文件头注明是从上游（agentcal/upstream）移植并「去 Effect 化」：Promise + listener 取代 Effect/Stream；形状刻意保持可互读（`reference/openmausbot/server/contracts.ts:1-6`）。
- **`ProviderDriver`**（`contracts.ts:446-461`）：`driverKind`、`metadata`、可省略的 `install` 描述、`decodeConfig(raw)`、`defaultConfig()`、静态 `models`、`create(input)`。「加一个 provider = `drivers/` 一个文件 + 一行注册」（`README.md:336-340`；`server/drivers/builtIn.ts:1-40`）。
- **`ProviderAdapter`**（`contracts.ts:214-300`）：会话运行时被压平为 `sendTurn / interruptTurn / respondToRequest / steer? / hasSession / stopAll / onEvent`。"sessions start implicitly on the first turn"，provider 原生续接由 `resumeCursor` 携带（`contracts.ts:86-89`）。
- **能力位（capabilities）**：`sessionModelSwitch`、`agentsMcp`、`computerMcp`、`composioMcp`、`phoneMcp`、`browserMcp`、`images`、`nativeImageInput`、`effortLevels`、`modelVariants`、`queueing`、`localComputerMcp`、`customMcp`（`contracts.ts:216-263`）。设计规则被写死在注释里："never show a knob the driver cannot turn"；能力缺省即不展示、不承诺。
- **未知 driver 降级**：`InstanceConfig.driver` 不做白名单校验，未知 driver 原样往返并呈现为 unavailable shadow snapshot，让新版本配置在旧版本上安全降级（`contracts.ts:63-74`；`server/harness/registry.ts:80-122`）。
- **审批语义进入 SPI**：`RequestOutcome = allowed-once | rejected | answered | unavailable`，`unavailable` 是 fail-closed 默认；`respondToRequest` 对已消失的 ask「resolve 而不是 throw」，调用方按 outcome 分支（`contracts.ts:78-83,266-284`）。`steer` 的三态 `steered/refused/indeterminate` 明确「indeterminate 不得重放」（`contracts.ts:285-303`）。

### 3.2 Driver 家族（17 个内建 kind）

`builtIn.ts:22-40` 注册了：Grok API、ACP 家族（Grok Build/Gemini/Kimi/Droid/Cursor/OpenCode/Qwen/Hermes/CustomAcp）、pi、openai-compat、Claude、Codex、Antigravity、BoxAgent、MiniMax。协议归一化按 provider 现状适配：

- **Claude**：每 turn 一个 CLI 进程，stream-json 双向往返，prompt 走 stdin，完成以真实 `result` 事件为准（对 claude 2.1.211 验证）；跨 turn 用 `--resume <sessionId>`（`server/drivers/claude.ts:1-6`）；审批走 `--permission-prompt-tool`，由 `server/permission-proxy.ts` 把 MCP 工具调用转发到 harness 内的 broker（`permission-proxy.ts:1-20`）。
- **Codex**：官方 `codex` CLI headless 的 app-server JSON-RPC（stdio 上换行分隔 JSON）；完成是真实 `turn/completed`；审批请求是进程内 server→client JSON-RPC，**无需 MCP 代理或 unix socket**；resumeCursor 是 codex thread id（`server/drivers/codex.ts:1-9`）。
- **Grok（API）**：OpenAI chat-completions 协议 + 共享瞬时失败重试（`server/drivers/grok.ts:1-5`）；Grok Build 走 ACP（`builtIn.ts:9`）。
- **pi**：`pi --mode rpc --no-session` 的 JSON-RPC；BYOK，凭证在 `~/.pi/agent/auth.json`；会话续接用 `sessionFile`（`server/drivers/pi.ts:1-18`）。
- **openai-compat**：transcript-replay，支持任意 OpenAI 兼容端点；诚实标注限制——只有聊天/推理流，**没有 tool calls**（`server/drivers/openai-compat.ts:1-2`；`docs/custom-engines.md:65-70`）。
- **local-inject**：探测 oMLX/Ollama/EXO/LM Studio/Unsloth 等本机 host，把 `host::model` 注入选型（`server/drivers/local-inject.ts:1-13`）。
- **原生协议 tee**：每个 provider 原生消息原样写 `native/<threadId>.ndjson`，方便与 canonical 流 diff 诊断协议漂移（`server/drivers/native.ts:1-27`）。

### 3.3 Registry / Bus / turn 生命周期

- **Registry**：`config map → live instances`；`create` 拥有全部实例状态，两次 create 不共享；失败必须 reject 而不是同步 throw，registry 把 reject 降级为 shadow（`registry.ts:1-6,76-124`）。`describe()` 输出模型目录、健康快照、安装路径、CLI 候选、鉴权能力，UI 从这里渲染而不是硬编码（`registry.ts:199-283`）。
- **EventBus**：fan-in；硬性不变量「adapter 只能为自己的 driver kind 发事件」；每个事件先 `redactSecrets` 再按 thread 追加 NDJSON（0600），带 best-effort size cap；日志写失败时只投递一次警告并在恢复后补写 marker，绝不递归回 publish（`server/harness/bus.ts:28-95`）。
- **canonical 事件**：从上游 49 种收窄到约 12 种，含 `session.started/exited`、`turn.started/completed/retrying`、`item.started/updated/completed`、`content.delta`、`request.opened/resolved`、`thread.token-usage.updated`、`runtime.error`；`raw` 保留原生消息供深挖（`shared/runtime-events.ts:22-132`）。
- **turn 派发**（`server/index.ts` 17,490 行的核心）：组装 system prompt 分节（soul、workspace、computer、composio、memory、skills、playbooks、recent work、coordination…，`index.ts:6284-6317`），`systemStable/systemVolatile` 拆分以让「每 thread 一个 CLI 进程」的 driver 不因记忆修改重建会话（`contracts.ts:121-129`），随后 `guardTurnDispatch(instance.adapter.sendTurn({...}))`，带 dispatch claim、取消窗口、watchdog、turn 资源释放（`index.ts:6319-6398`）。
- **中断与转向**：`interruptTurn` 由 adapter 实现；`steer` 只在 `capabilities.queueing` 时可用；忙碌 1:1 的排队语义在 `server/steer-queue.ts:1-17`（排队文本在 turn 结束后合成一个 follow-up turn；Stop 后仍保留用户自己的话——delegation 才丢弃）。

## 4. API 层（重点 C）

- 手写 `node:http` server：`createServer(handleRequest)`，按 method/path 大 switch，不是 Express 风格路由（`server/index.ts:7,17306`；`/api/...` 路径常量共 101 个，含 `/api/bots`、`/api/groups`、`/api/routines`、`/api/webhooks`、`/api/instances`、`/api/build...` 等）。
- **一条 SSE**：`GET /api/events`（`index.ts:12537`）。带 per-client 背压策略：screen 帧可丢、durable 事件绝不静默丢；超过 4MB 缓冲直接断开，靠 Last-Event-ID 重连回放（`server/sse-fanout.ts:21-67`；`index.ts:3181-3258`）。
- Native client 因 `EventSource` 不能加 header，先取 5 分钟 ticket：`POST /api/auth/stream-ticket` → `GET /api/events?ticket=…`（`docs/self-hosting.md:440-444`）。
- **wire 模型单一来源**：`shared/wire.ts` 是「服务端记录、桌面客户端、（未来）移动端不能漂移」的唯一定义；字段是「服务端逐字节必然发送」的承诺（`wire.ts:1-10`）。`ServerFrame` 联合 18 种帧（`wire.ts:438-461`）。
- **模型目录**：每个 instance 的 `models` + snapshot + capabilities 由 registry.describe() 汇总；模型选择是请求上的数据值（`ModelSelection{instanceId,model,effort?,variant?}`），instanceId 是路由键（`wire.ts:38-47`）。
- **计算机生命周期**：`Surface = "cloud" | "vm" | "local" | "browser"`（`wire.ts:52-54`）；`/api/computers/boxes`、`/api/computers/vps`、`/api/local-computer`、`/api/shared-computers` 等路由；Bot 级 `computer`（"Works on"）、`cloudBackend`、`autoStartVps`（`wire.ts:201-207`）。
- **connectors/config**：`/api/connectors*`（Composio）、`/api/config`、`/api/instances*`（引擎安装/登录/模型）。

## 5. 审批与权限（重点 D）

- **设计哲学**：审批等级是 _provider 自己的权限模式原样透传_；应用不做 allowlist/分类器/模式匹配——「到达你面前的请求，就是 provider 留给你的请求」（`docs/approval-levels.md:1-8`；`server/auto-approve.ts:1-8`）。等级：Ask / Auto-accept edits / Approve for me / Full access / Custom(Codex)（`approval-levels.md:10-16`），每个 provider 的映射表见 `approval-levels.md:101-113`。
- **Full access 是高危常驻授权**：只能在打包的本地桌面应用里通过私有进程通道开启，开发版/独立 web/远程页面隐藏；HTTP API 开不了（`approval-levels.md:18-25`）。服务端用 `BotRecord.approvalGrant` journal 记录 prepared/confirmed/activated/committed 四阶段，重启后残留一律撤销（`server/store.ts:303-314`；`index.ts:1911-2022`）。
- **权限 broker**：Claude driver 的 broker 是 per-turn net server（POSIX unix socket / Windows named pipe；路径包含 threadId+botId 摘要，防跨 bot 冲突）（`server/drivers/claude.ts:480-556`；`server/procs.ts:227-234`）。`permission-proxy` 是两个工具（`approve`/`ask_user`）的 MCP stdio server，把每个 ask 经 socket 转给 broker 等人工回答；CLI 自带 `AskUserQuestion` 被特殊拦截成「多问题卡片」而不是 Allow/Deny 一个 JSON blob（`permission-proxy.ts:1-20,80-141`）。answer 回传支持 `updatedPermissions`（Always allow this session 交给 provider 自己记住，应用不留 grant，`permission-proxy.ts:200-223`；`contracts.ts:276-283`）。
- **卡片作为一等对象**：`OptionCardData` 带 `requestId`、`tool`、`held/heldCode`、`allowKey`、`allowSession`、`approvalScope:"local-computer"`、routine/profile/team/skill/question 子卡（`wire.ts:315-347`）；对应 runtime 事件 `request.opened`（含 `questions`、`requiresExplicitApproval`、`nativeReview`、`allowSession`）与 `request.resolved`（decider 来源 `user/auto/timeout/system/unavailable/peer`）（`shared/runtime-events.ts:84-119`）。
- **自动裁决只做一件事**：Full access 时把残余 native prompt 代为 allow；其余由 provider 自己的 reviewer（Auto/Custom）留下的卡仍给人（`auto-approve.ts:8-80`）。delegation 用接收方自己的等级，唯一例外：Chief of Staff 的 Full access 会传给被委派线程（`approval-levels.md:40-54`；`auto-approve.ts:33-56`）。
- **与电脑的关系**：cloud 与 local 共用同一 broker 语义；`approvalScope:"local-computer"` 让本机动作的 remembered grant 不与云/工具审批共享（`wire.ts:336-337`；`runtime-events.ts:94,118`）。本机控制属于「显式 opt-in + fail-closed」：Ubuntu Wayland 因 issue #345 的真实座席安全门永不开本地控制，遗留 opt-in 会被清理；Xorg 需显式 opt-in 且不含全屏光标覆盖（`README.md:263-285`；`docs/linux-desktop.md:9-23,178-180,205`）。这也是我们能直接借鉴的「能力矩阵 + 安全门」写法。

## 6. 计算机 / 沙箱（重点 G）

- **本地桌面**：政策文件写明 CUA 是唯一本地桌面控制 provider（无 cliclick/robotjs/Python computer-server 备胎）；必须由 Electron 主进程 spawn（macOS TCC 归因），harness 只接收经校验的 MCP proxy 契约；插件的注入形式就是一条 `--mcp-config`（`docs/computer-use-integration.md:12-21,39-62,99-128`）。CUA 工具面 20+（AX 路径优先于像素坐标，后置于前台输入阶梯）（`computer-use-integration.md:130-135`）。
- **浏览器**：三档——Electron `WebContentsView` + `webContents.debugger`(CDP) 零安装内嵌（每 bot `persist:bot-<id>` profile）；opt-in 真 Chrome 扩展桥（playwright-mcp `--extension`）；opt-in 打包 `@playwright/mcp`（`computer-use-integration.md:145-167`）。
- **云与 VM**：Box 云电脑、本地隔离 VM、VPS、容器、共享电脑分别有模块（`server/box.ts`、`server/local-vm-*.ts`、`server/vps-computer.ts`、`server/container-computer.ts`、`server/shared-computers.ts`、`server/team-computers.ts`）。headless server 上 cloud/container 电脑可用、host 桌面控制不可用（`docs/self-hosting.md:19-39`）。
- **能力门控**：是否注入 computer MCP、screenshot/click 工具由 driver 的 `computerMcp` 等能力位决定；「绝不能告诉 bot 它有一台它的引擎挂不上的电脑」（`contracts.ts:216-263`）。这是与我们的审批/工具分级（`docs/botharness.md:74`）最接近的现成实践。

## 7. 审批之外的状态与持久化（重点 F / I）

### 7.1 磁盘布局

- 数据根 `~/.openmausbot`（可 `OMB_DATA_DIR` 覆盖），旧目录 `.opengrokbot` 兼容（`server/config.ts:670-673`）。子目录：`events/`（canonical NDJSON）、`native/`（原生协议 tee）、`workspaces/<botId>/`（记忆+工作区）、`memory-journal/`、`bots/`（SOUL.md 镜像）、`messages.db`（SQLite transcript）、`config.json`（`config.ts:672-673`；`server/bot-folder.ts:19`；`docs/memory.md:12-19,103-107`；`server/message-db.ts:20`）。
- **transcript**：SQLite（Node 内置 `node:sqlite`，免依赖），每消息一次 INSERT、每次 patch 一次 UPDATE；WAL、0600（含修复遗留宽松 umask）；FTS5 建 recall 索引；旧 `messages-<threadId>.json` 惰性导入后 DB 为事实源（`message-db.ts:1-38,106-124`）。Bot 记录在 `bots.json`，含 thread→instance 绑定与 per-instance resume cursor（`server/store.ts:1-5`）。
- `BotRecord` 在 wire 之外私有：`resumeCursors`、`approvalGrant`、profile/team 卡回执（`store.ts:298-317`）。

### 7.2 记忆（重点 F）

- 目录：`~/.openmausbot/workspaces/<botId>/MEMORY.md` + `memory/<topic>.md` + `memory/log/YYYY-MM-DD.md`；该目录同时是 bot 无项目文件夹时的私有工作区（`docs/memory.md:12-26`）。
- **注入预算**：每 turn 只把 `MEMORY.md` 的**前 200 行或 24KB（先到为准）**放进 system prompt；topic 与 log 永不自动加载，靠文件工具按需读；预算常量 `MEMORY_MAX_LINES/MEMORY_MAX_BYTES` 在 `server/workspace.ts:39-52`，加载逻辑 `workspace.ts:94-120`。UI 有 gauge（80% amber、溢出 red 并显示未加载行数）（`memory.md:34-47`）。
- **写入**：原子写 + 0600 + 先过 secret 脱敏（`memory.md:28-32`；`server/workspace.ts:158`）。模型侧有专用工具 `memory_update`（append/replace/supersede/remove；`server/drivers/agents-proxy.ts:662,1491-1495`）；系统提示要求「只通过 memory_update 改 MEMORY.md，不要直接文件工具/整文件覆写」，写满时提示整合（`workspace.ts:591-606`）。但 bot 仍可用自己的文件工具写 topic——**不是**纯工具写路径，审计靠 turn 边界 diff（`memory-journal.ts:1-8`）。
- **journal**：`~/.openmausbot/memory-journal/<botId>.ndjson`，刻意放在 bot 工作区之外——「被审计者能改的审计轨迹不是审计轨迹」。每行记 actor（bot/person/import）、via（ui/api/turn/disk/revert/import）、before/after hash、diff、完整 prior 文本；Undo 本身也入账；含凭证的旧文本与过大的旧文本不可撤销（`docs/memory.md:103-118`；`server/memory-journal.ts:1-22`）。
- **人工编辑冲突**：保存带 `expectedHash`，不一致返回 409 + 当前文本；UI 提供 Reload/Overwrite（`docs/memory.md:55-71`；`server/memory-store.ts:276-310`）。
- **跨会话记忆**（无 transcript 挂载）：每 turn 注入 recent-work brief（每段其他会话最近一句、≤10 行/约 350 token，私聊入群需 chip 披露）+ 每 turn 一行 daily log + `session_search since/until` 时间召回（`memory.md:73-101`）。

## 8. Bots、身份与渠道（重点 E）

- **Bot 模型**（`shared/wire.ts:171-254`）：`name/title/description` + `soul`（standing instructions）+ `soulHash/soulDrift`；每 bot 默认 `modelSelection`；`computer`、`cwd`、`autoApprove/approvalMode/alwaysAllow`、`composio/browser/mcpServers/browserProfile`、`playbooks`、`chiefOfStaff/managedSections/peers/approvePeerComms`、`pinned/hidden/section`、`activity`（working/waiting-on-you/idle/no-signal/dead）。
- **SOUL.md 是镜像不是事实源**：prompt 从记录构建，文件供人阅读/编辑/导出；镜像与记录不一致只作为 drift 呈现给用户，绝不自动应用；文件夹放在 bot 可写工作区之外，防止 bot 读取不可信内容后把注入文本持久化进自己的人格（`server/bot-folder.ts:1-10,42-101`）。系统提示里 standing instructions 的优先级被明确排序：人格 < 用户当前请求和安全边界（`bot-folder.ts:90-101`）。
- **渠道（Channels）**：每渠道有独立 transcript、共享 instructions（`bulletin`）、working folder（`cwd`）、responder 规则（member/everyone/mentions）、可编辑 roster 与独立任务；`WireGroup` 见 `wire.ts:379-426`，产品说明见 `README.md:145-149`。「每个 bot 一个 thread」在 `WireBot.threadId`（当前选中任务），threads/tasks 在 bot 内成列（`wire.ts:103-138,171-176`）。
- **Team 导入**：一份 `.md`（YAML frontmatter 的 `format: openmaus.team` + version + members(name/title/description/soul/appearance) + rooms + connectors…）一键创建 bots/Chief/channels/playbooks/routines；连接默认关、routines 导入即暂停、包内不含凭证/会话/权限/记忆/电脑访问（`server/team-manifest.ts:1-70`；`README.md:151-163`）。**格式说明在外仓** `openmausbot-teams/FORMAT.md`（`README.md:162-163`，本轮未克隆，未验证）。
- **Chief of Staff**：每个 section 的协调者；system prompt 动态列 roster（≤40），委派工具 `delegate_bot/ask_bot/coordinate_bots`，只把它自己会话的 Full access 传下去（`server/chief-of-staff.ts:17-66`；`approval-levels.md:40-54`）。
- **Bot 间通信**：`integrations.agents` 是 harness 控制的 MCP proxy（`list_bots/ask_bot`），turn/权限/递归限制都归 harness（`contracts.ts:162-165,219-223`）。这与我们「跨 PersonaBot 通信只留 seam」的取向一致，但 OMB 已实现为受控工具面。

## 9. Routines / Webhooks / 任务（重点 H）

- **Routine 是持久记录**：`schedule` 支持 once / daily(weekdays) / cron(5 字段 + IANA 时区) / interval(5–1440 分钟)；另有 `runOn: maus|cloud`、`continuity`（把上次报告带入下次 prompt）、`sourceThreadId`（聊天创建来源）、`resultsThreadId`（固定汇报位）、`nextRunAt`（`server/routines.ts:17-27,67-108`）。
- **调度语义**：interval 以 `anchorAt` 对齐，不因停机漂移（`routines.ts:619-625`）；interval/cron 的同一 routine 有 queued/running/waiting 时不叠加下一次，防无界堆积（`routines.ts:1370-1380`）；迟到 ≤12h 允许一次补跑，更老记 `missed` 回执；没有外部 always-on 调度器，应用不跑就不跑（`routines.ts:1370-1392`；`docs/routine-schedules.md:47-70`）。
- **RoutineRun 状态机**：queued/running/waiting/completed/failed/cancelled/missed（`routines.ts:110-119`）；运行结果有独立结果卡与 run log；cron 与 interval 用 Croner 共享同一日历计算，预览与执行同源（`routine-schedules.md:11-39`）。
- **Webhook 触发**：独立 receiver 默认 `127.0.0.1:8800`（或 OMB_PORT+1 / `OMB_WEBHOOK_PORT`）；secret 创建/轮换时一次性展示；推荐 Bearer（避免 secret 进 URL/日志），保留 capability URL；只暴露 `/health` 与 `/hooks/...`，绝不复用 app API；必须保持进程在跑；公网只应代理这一个小 receiver（Tailscale Funnel 等）（`README.md:309-325`）。代码侧有投递幂等（deliveryId）、限流（10/min）、最多 3 个 pending run、attempt 记录上限（`server/webhooks.ts:52-82,100-110`）。
- **与 ADR-0017 对照**：OMB 的 "Task" 本质就是一次会话/对话（"One task = one conversation with its own context, thread and provider session"，`wire.ts:103-105`），没有独立的 Task 账本；routine 跑的是「跨线程的执行记录 + 结果卡 + 汇报位」。我们「工作=Session，无 Task 实体」与之同向；差别只是 OMB 把会话命名为 task，并用 `RoutineRun` 记录无人值守执行。

## 10. 凭证与配置（重点 I）

- `~/.openmausbot/config.json` 单文件，含 `{"xai":{"key":…},"composio":{"apiKey":…},"box":{"token":…},"instances":{…}}`（`server/config.ts:1-3`）；`environment` 字段值**明文**存储，建议用单引擎作用域的 key（`docs/custom-engines.md:74-76`）；CLI 安装器也明确「API keys 明文保存、不加密、0600、私有 config.json」（`README.md:376-378`）。
- **写后不回显**：Settings → Model providers 的 workspace key 是 write-only，页面只显示 connected-or-not + Test（一次只读请求）（`docs/self-hosting.md:295-310`）；README 将 "Secrets are write-only: the UI only ever sees 'configured' flags" 作为卖点（`README.md:134-139`）。
- **凭证请求卡**：`SecretRequestCardData.target` 是固定的 allowlisted `CredentialTargetId`，绝不是任意配置路径（`wire.ts:364-377`）；由 `request-credential` 流程把 agent 的请求转为卡片（`server/credential-request.ts` 存在，未逐行读）。
- 与 ADR-0006 对照：OMB 的**静态** key 直接违反我们「配置零明文」；但 write-only UI + Test 语义、allowlist target、卡片式索取值得复用。

## 11. 客户端与多表面（重点 J）

- **React 应用**：文件头写明「The React app holds no transports of its own: typed commands over HTTP + fold the one SSE into local state. The reducer stays pure; everything async lives in the wrapped dispatch + SSE fold」（`src/state/store.tsx:1-6`），`reducer` 是 3501 行文件里的纯函数（`store.tsx:1170`）。hydration 与实时流有明确边界：等 hello 后才快照、快照期间帧入队后套用（`store.tsx:3200-3250`）。
- **SSE 细节**：screen 帧是「可替换」数据，背压时丢弃；durable 帧绝不丢，超界直接断连靠 Last-Event-ID 回放（`sse-fanout.ts:21-49`）。
- **Electron + companion**：renderer 同源 HTTP/SSE（无 bearer）→ Electron loopback relay 8798 → host companion 8810（默认拒绝 + 路由白名单 + 响应脱敏）→ harness 8799；client 模式不启动本地 harness/computer daemon/browser host，UI 与流式 store 完全不知道第二种传输（`docs/desktop-companion.md:71-86`）。配对 token 只存 OS 加密凭证文档，由 loopback relay 注入，绝不进页面/URL/浏览器存储（`desktop-companion.md:58-69`）。
- **CLI / server / 手机**：`npx openmausbot start|serve|pair`；pairing code 一次性 5 分钟，session 30 天可撤销；scope 分 `admin`/`client`（`docs/self-hosting.md:41-60,189-230,378-448,529-555`）。
- **MCP 控制面**：内置 stdio MCP server 给外部客户端（Claude Desktop/Cursor）用，工具集故意有界：inspect / create / run work / wait / interrupt / switch model；**不暴露**审批、授权记忆、删除、导入团队、改凭证、电脑/VM 生命周期；transcript 分页 ≤200、搜索 ≤100、剔除截图像素与 permission grant key；打包版对写操作要求配对的 `OPENMAUSBOT_TOKEN`（`docs/mcp-server.md:3-15,101-119`）。
- 与我们对照：DSH 提供 UI/会话/settings 宿主，我们不需要复刻这个三端产品面；但「一条流 + 纯 reducer」「一个 loopback relay 消解第二传输」「有界 MCP 控制面」三点可直接进入 M3 设计备选。

## 12. 工程实践

- **测试与验证**：vitest + `node --test`（Electron 主/preload）+ broker 专门测试（`package.json:25-33,64`）；`docs/verification/` 下按功能有大量「可复现验收配方」，AGENTS.md 要求「声称 server/会话改动生效前必须按 verification/README 在隔离 fixture 验证，绝不拿用户真实数据验证」（`reference/openmausbot/AGENTS.md:3-4`）。
- **安全横切**：原子写（`server/atomic.ts`）+ 0600 + `redactSecrets` 在 bus/native/memory/config 复用（`bus.ts:46-55`；`native.ts:12-27`；`workspace.ts:158`）。
- **兼容性纪律**：未知 driver → shadow 而非崩溃；能力位缺省即不提供；旧客户端配置原样往返（`contracts.ts:63-74`；`registry.ts:1-6`）。
- **许可证与来源**：仓库从 MIT 重许可到 Apache-2.0（NOTICE 记录全体贡献者同意）；Antigravity ACP 集成改编自 T3 Code（MIT）；手机凭据传输用 hpke-js（MIT）（`reference/openmausbot/NOTICE:1-12`）。`third_party/cua-driver/` 是教科书式 provenance：上游 commit、archive/二进制 SHA-256、Inter 字体哈希、cargo-about 生成 SBOM 与许可证报告、打包时校验（`third_party/cua-driver/README.md:1-12`；`README.md:281-285`）。
- **风险信号**：`server/index.ts` 单文件 17,490 行；产品面（Electron/iOS/Android/语音/浏览器）远超我们 PoC 范围，直接抄代码的成本高。

## 13. 可借鉴清单（adopt / adapt / reject，映射我们的 ADR / PRD）

| #   | 结论                  | 内容                                                                                                                                        | 一手依据                                                                            | 映射                                                                                                                                         |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **adopt（概念）**     | Adapter 能力位（capability flags）+ 未知/坏配置降级为 unavailable shadow，绝不崩                                                            | `contracts.ts:216-263`；`registry.ts:80-122`                                        | ADR-0015 薄插件边界；M1/M5 适配器                                                                                                            |
| 2   | **adopt（语义）**     | 审批卡作为一等对象：requestId、allow-once vs always-session（交给 provider 记忆）、`unavailable=deny` fail-closed、resolved 带 decider 来源 | `wire.ts:315-347`；`runtime-events.ts:84-119`；`contracts.ts:78-83,276-283`         | PRD US-5/FR-5；`docs/botharness.md` §5 审批分级                                                                                              |
| 3   | **adapt（记忆）**     | journal 放 bot 工作区外 + turn 边界 diff + expectedHash 冲突 + 预算 gauge                                                                   | `memory-journal.ts:1-22`；`memory-store.ts:276-310`；`docs/memory.md:34-47,103-126` | ADR-0003/0012/0013；PRD AC-3.3、M2/M5；我们的 git 版本化可与其 journal 合并（journal 是 per-change undo，git 是 per-turn commit）            |
| 4   | **adapt（凭证）**     | write-only UI（只显示 configured + Test 一次只读调用）+ allowlist credential target                                                         | `README.md:134-139`；`self-hosting.md:295-310`；`wire.ts:364-377`                   | ADR-0006、AC-5.2、M8；secret 本体仍进 DSH credentials                                                                                        |
| 5   | **adopt（可观测）**   | 每 thread canonical NDJSON（脱敏 + 轮转上限）+ 原生协议 tee 便于协议漂移 diff                                                               | `bus.ts:44-95`；`native.ts:1-27`                                                    | 我们架构文档「结构化日志 / session log」；M4 诊断                                                                                            |
| 6   | **adapt（调度）**     | interval anchor 对齐、skip-if-running、≤12h 补跑/更老 missed、continuity、webhook deliveryId 幂等 + 限流                                    | `routines.ts:619-625,1370-1392`；`webhooks.ts:52-82`；`README.md:309-325`           | ADR-0017 后果（无人值守先加 pending prompt 队列）；PRD 附录 D                                                                                |
| 7   | **adapt（人格）**     | SOUL.md 镜像 vs 记录：可读可编辑、drift 显示、绝不自动应用、放在 bot 可写区之外                                                             | `bot-folder.ts:1-10,42-101`                                                         | ADR-0014：我们以 `PERSONA.md` 为**事实源**（人属、memory 内），方向相反——采纳其「提示注入不该能改写人格」的理由与 drift 检测，不采纳镜像架构 |
| 8   | **adapt（团队分发）** | 一份带 YAML frontmatter 的 `.md` 导入团队：成员 soul、房间、routines 暂停、连接默认关、零凭证                                               | `team-manifest.ts:1-70`；`README.md:151-163`                                        | ADR-0012（front-matter）、M5 客户跟进场景；作为后续 PersonaBot 模板/导出的形态参考                                                           |
| 9   | **adopt（客户端）**   | 「一条 SSE + 纯 reducer + 零客户端传输」；durable 帧不丢、screen 类可丢、断线 Last-Event-ID 回放                                            | `store.tsx:1-6`；`sse-fanout.ts:21-49`；`self-hosting.md:440-444`                   | `@botharness/client`（M3）状态事件；优于多传输设计                                                                                           |
| 10  | **adapt（控制面）**   | 有界 MCP 控制面：可读、可派活、可中断，但审批/凭证/删除/电脑生命周期永不出 API                                                              | `docs/mcp-server.md:3-15,101-119`                                                   | `docs/botharness.md` §6 扩展面（第三方只读 registry/订阅事件）；可作后续外部 agent 接入形态                                                  |
| 11  | **reject**            | 静态 API key 明文存 `config.json`                                                                                                           | `config.json`/`README.md:376-378`；`custom-engines.md:74-76`                        | 违反 ADR-0006 与 AC-5.2                                                                                                                      |
| 12  | **reject/观察**       | Full access 原样透传 provider 权限模式                                                                                                      | `approval-levels.md:1-8,101-113`                                                    | 我们的 Agent 是 DSH executor，不是带 permission mode 的 CLI；审批在宿主层做（PRD FR-5），不复刻                                              |
| 13  | **观察**              | 17k 行 `index.ts` 单体                                                                                                                      | `server/index.ts`（17,490 行）                                                      | 我们 M1 已按模块拆分（`docs/architecture/botharness-architecture.md:79-86`）；反面教材                                                       |

## 14. 存疑与待验证

- **未运行验证**：本轮只读代码/文档，未启动 app、未连 Box/Composio/Cua；运行时行为（尤其 Box API、Cua 实机、Electron 私有通道）均为**未验证**。
- Team 包格式细节在外部仓库 `milind-soni/openmausbot-teams` 的 FORMAT.md，本 clone 内只有解析器 schema（`team-manifest.ts`）；格式版本兼容性**未验证**。
- `enterprise/` 只读了 LICENSE 与 FEATURES（entitlement 清单：whitelabel/sso/admin/budgets/billing，`enterprise/FEATURES`），未审计实现。
- 驱动家族里的 Antigravity、BoxAgent、Minimax、ACP 各分支未逐行读；结论基于 `builtIn.ts:22-40` 的注册表与各文件头。
- 语音、iOS/Android companion、browser-engine 等旁支只按 README/docs 摘要，未验证实现与文档一致性。
- 「内存树注入」在 OMB 是 MEMORY.md 预算加载 + 指针约定，**没有**我们 ADR-0004 的 per-file front-matter 树；两者不可混为一谈。
- OMB 无 per-entry `visibility/owner`（ADR-0013 的隐私模型），跨会话披露靠 brief chip 与 `session_search` 披露审计（`docs/memory.md:84-97`）；具体隐私边界**未在代码中定位到等价模型**。

## 15. 复现命令

```bash
# 克隆（已完成；只读，不 install/build/run）
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd /home/doodlebear/project/DeepSeekBot && git clone --depth 1 https://github.com/milind-soni/OpenMausBot reference/openmausbot"
cd reference/openmausbot && git rev-parse HEAD
# b054afda144436bc797ee7bbedfc38ce54938cbc

# 关键入口
wc -l server/index.ts server/contracts.ts shared/runtime-events.ts shared/wire.ts server/harness/*.ts
sed -n '1,60p' server/drivers/builtIn.ts
sed -n '1,120p' docs/approval-levels.md
grep -n 'MEMORY_MAX_LINES\|MEMORY_MAX_BYTES' server/workspace.ts
```
