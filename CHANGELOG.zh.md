# DeepSeekBot 更新日志

这里记录 DeepSeekBot 值得关注的变化。添加或发布条目前，请先阅读
[Release Ledger 贡献指南](docs/agents/changelog.md)。

## [Unreleased]

推进首个 PersonaBot 工作流，交付 Assignment、共享动效控制与 Channel composer island。

### Added

- PersonaBot 私聊现可查看已接受的记忆文件、编辑现有 Markdown 文件并检查经过验证的提交历史与差异；Agent 的普通文件写入会在成功回合后接受，暂存或分叉的仓库状态会阻止继续保存；Human 可明确修复：先归档未完成更改，再恢复已接受的 head（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- PersonaBot 需要尚未授权的项目文件夹时，Orchestrator 可在私聊发送授权请求卡；Human 在卡上选择 Host 文件夹后，明确的授权回复唤醒同一个 Orchestrator Session，再创建事项（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- Human 可在 PersonaBot DM 侧栏通过 DSH 目录选择器或绝对路径添加 Host 文件夹，并移除有效授权而不删除文件；侧栏默认只显示固定 Memory 与有效文件夹，Bot 设置中的开发者模式开关可显示撤销历史与高级文件夹选项。新事项保留所选 Grant 与单目录权限快照；Orchestrator 的读取边界仍待实现（[#116](https://github.com/BotHarness/BotHarness/issues/116)、[ADR-0063](docs/adr/0063-workspace-grants-bound-personabot-file-access.md)）。
- Bot 模式的 Channel 现可用 Shift 按可见顺序范围选择、用 Ctrl／⌘ 逐个增减；右键任一已选 PersonaBot DM 或群聊 Channel，可在按数量显示文案的菜单中批量置顶或取消置顶、移动到分组（包括从置顶区移动）或隐藏；每次多选通过单个有数量上限的 Host 命令提交，并一起呈现在列表中，不再另设操作栏。破坏性批量删除仍待 [#138](https://github.com/BotHarness/BotHarness/issues/138) 定义（[#215](https://github.com/BotHarness/BotHarness/issues/215)）。
- 置顶 Channel 默认跟随全局排序，也可独立选择最近更新或手动排序；在置顶区内拖拽可调整位置而不取消置顶，手动落点会持久化，并同步作用于展开侧栏与折叠 rail（[#215](https://github.com/BotHarness/BotHarness/issues/215)）。
- Web 侧栏现可用 Alt+1–9 打开对应的可见 Channel、用 Alt+0 打开第十个；按住 Alt 时会显示行内数字提示，Alt+波浪线键切换 BOT 模式。输入框不会被快捷键抢占，桌面宿主的 Ctrl／⌘ 映射留待后续接入（[#216](https://github.com/BotHarness/BotHarness/issues/216)）。
- Bot 与桥接 Channel 消息现在使用 DSH 原生安全渲染器显示 Markdown；Human 消息仍保留原样文字与换行（[#142](https://github.com/BotHarness/BotHarness/issues/142)）。
- PersonaBot 的回复在生成 `channel_send` 时会先作为 Channel 实时草稿出现，提交后由唯一正式消息接替；中断的草稿会消失并显示明确状态（[#144](https://github.com/BotHarness/BotHarness/issues/144)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- Channel 消息现在可引用同一 Channel 中已提交的消息。输入区支持回复与取消；气泡显示作者和摘要，点击可定位较早历史；原消息不可见时安全降级（[#145](https://github.com/BotHarness/BotHarness/issues/145)）。
- Human 与 PersonaBot 的 Channel 消息现在可携带上传图片和可下载文件；上传失败可在输入区重试，已提交消息只保存 profile 范围内的附件引用（[#146](https://github.com/BotHarness/BotHarness/issues/146)）。

- Bot 设置分区里的 Computer 分组支持在导出时选择目标目录，并可一键在宿主文件管理器中打开目录；当部署未挂载目录选择器时也可以手动输入路径（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- Bot 设置分区新增 Computer 分组：导出目录通过宿主原生目录 picker 选择、空闲停止时间就地编辑、导出/导入在同一页完成且都需显式授权；这些属于运行时设置，修改后无需重启 DSH（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- 新增分页 Channel 时间线：连续消息合并为气泡组；仅 Bot 消息展示头像，用户消息不显示头像，每组仅展示一次发送人和时间；提供复制、定位右键操作，向上加载历史时保持阅读位置，可跳转到新消息，并在再次打开时定位至上次实际读到的已提交消息附近（[#143](https://github.com/BotHarness/BotHarness/issues/143)、[ADR-0061](docs/adr/0061-channel-timeline-uses-opaque-cursors.md)）。
- 新增可选的 Computer 插件：在本地 Docker 中运行 profile 级共享的 Linux 桌面，以带 DSH 会话鉴权的 VNC 面板呈现在 Web Client 中；启动与停止都需显式授权，拉取镜像时展示实时进度，空闲自动停止，并支持把 Computer 的持久存储导出/导入为单个归档文件；PersonaBot 绑定与基于 Settings 的目录选择器仍是后续切片（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- 新增 Channel sidebar shell：Bot mode 右侧区域按统一注册 seam 渲染有序、可折叠的 entries（group 成员、DM 事项）（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增第一颗可由 Human 验收的 PersonaBot Assignment tracer bullet：PersonaBot 可通过 durable Bot Inbox 接收 DM，运行 Orchestrator 与独立 Assignment Session，由 Orchestrator 显式把 Assignment 结果发送回同一 Channel，并提供 Assignment 列表/详情视图；默认 Memory 与 Workspace Grant 行为仍是 [#81](https://github.com/BotHarness/BotHarness/issues/81) 的后续工作。
- 新增持久化的 BotHarness 动效偏好，提供跟随系统、减少动效与完整动效三种模式，并通过可访问的实时预览和唯一 effective policy 供 Client surfaces 共同消费（[#128](https://github.com/BotHarness/BotHarness/issues/128)）。
- 将 DM 与 group Channel composer 重构为响应式 floating island，支持多行输入，并提供可访问、仅消费投影的 PersonaBot activity region（[#129](https://github.com/BotHarness/BotHarness/issues/129)）。
- 为独立的 DeepSeekBot 与 DSH Skill release train 新增确定性、只读的 GitHub Release draft 准备流程（[指南](docs/agents/changelog.md#preparing-a-github-release-draft)、[#103](https://github.com/BotHarness/BotHarness/issues/103)）。
- 新增 Computer 导出与迁移指南，覆盖跨机器单文件迁移、必须随迁移保留的文件所遵循的持久 `~/workspace` 约定，以及体积/耗时预期（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。

### Changed

- 启动 Computer 现在会等桌面 Web 端口真正响应（上限约 90 秒）才报告 running，viewer 不再挂进还没 READY 的端口看黑屏 connecting；等待期间 entry 与设置行实时显示 starting 阶段，90 秒无响应则明确报错、可重试，而不是悄悄建成一个坏的 running 态（[#223](https://github.com/BotHarness/BotHarness/issues/223)）。
- Computer viewer 现在与 Selkies 自身会话状态同步，不再只看 canvas 尺寸：live 需要有尺寸、像素在变、`#status-display` 无 connecting/reconnecting——真静态桌面在短暂宽限后仍会转 live，卡死的流会老化进入可重试空态——打开 viewer 不会在 Selkies 还在建连时就报已连接。建连协商有独立耐心预算（不再 5 秒就判空）、丢流持续几次才重挂、从未 live 的文档有界自救，全新启动无需手点重试即可恢复（[#221](https://github.com/BotHarness/BotHarness/issues/221)）。
- Computer 侧栏的运行态卡片现在采用 AgentScreen 式呈现：按画面比例取景的静止卡，悬停浮现蓝色 **打开** pill；点击进入全屏 viewer——标题栏含 Bot 名、实时状态、停止与收起（只能点收起按钮返回，页面滚动锁定），同一个 iframe 只在卡片与全屏之间切换几何，打开不再重建流连接。进入时先显示连接中，持续无画面则给出带重试的明确空态；开启视图不再显示裸 exit code（如 `exited code=137`），只保留共享说明；所有颜色读取 DSH design tokens 或 primitives，浅色/深色主题下均正确渲染（[#167](https://github.com/BotHarness/BotHarness/issues/167)）。
- Computer 导出现在会在打包前优雅关闭浏览器（上限约 10 秒，超时回退为普通停止），且每次启动都会播种持久的 `~/workspace` 目录，因此迁移后的配置以已落盘的登录态与标签页打开，Bot 的工作文件也随归档一起走（[#154](https://github.com/BotHarness/BotHarness/issues/154)、[ADR-0062](docs/adr/0062-computer-volume-quiesce-and-workspace.md)）。
- 导出/导入期间，Computer 设置行与侧栏卡片会实时显示阶段与已用时，不再只有笼统的忙碌文案（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- Computer 的设置行——导出目录、空闲停止、导出 / 导入——现在统一归入 BotHarness 设置页上自己的 **Computer** 分组标题下（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- Channel 顶部标题改为悬浮在消息渐隐层之上的可点击名称安全岛，点击可打开右侧 Channel sidebar；右侧栏顶部也不再绘制分隔线（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- Bot 图标选择改为「所见即所得」的卡片网格：每张卡片直接展示图标外观，选中的卡片以边框强调，不再用只显示名字的 selector（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 文案全面跟随 DSH 语言，不再只有设置页：名册、分组管理、创建 PersonaBot、Channel sidebar entries、输入框与活动状态在英文界面下都显示英文（[#184](https://github.com/BotHarness/BotHarness/issues/184)）。

- 应用侧边栏的 Bot 模式切换按钮更高、图标与文字更大：再次点击整行会退出 Bot 模式，hover 时右侧出现设置齿轮，点击直接打开设置对话框的 Bot 分区（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- BotHarness 有了自己的 Bot 图标：应用侧边栏的「BOT 模式」入口与 Bot 设置分区的导航项默认显示 DeepSeekBot 吉祥物（含亮/暗两套图），新增的「Bot 图标」行可在吉祥物、简约版、生成形象与通用机器人图标之间切换（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 的偏好设置移入设置对话框中专属的 Bot 分区——界面动效与 BOT 列表排序两行从原生「通用设置」移出，Computer 的设置、导出/导入与资源上限随后也会落在这里（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- Computer 改为拉取上游 webtop 镜像（XFCE + Chromium），不再使用 BotHarness 自建的 Chrome 镜像，并以显式资源上限运行——默认 2 核 2 GiB 内存、swap 与上限相同、512 MB 共享内存、4096 进程，空闲 30 分钟自动停止，且都可按 Host 覆盖：镜像缩小约 470 MB，静置内存从约 2.4 GiB 降至约 1.15 GiB（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- Computer 桌面改用适合观看的面板尺寸——更高的顶栏与更大的图标、更高的底部 dock；仅在默认配置上播种，人手工调过的面板不会被覆盖（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- PersonaBot Agent 现在会加入 agent preset（默认 `standard`），Orchestrator 因此在 Memory Repository 内具备普通 file、Shell、grep、git 工具，可以直接持久化记忆；Orchestrator 自行记录记忆、只把独立工作委托给 Assignment，而 Assignment 把值得记忆的内容回报给 Orchestrator，不写仓库（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Orchestrator 现在不必等待 Assignment 结束：`create_assignment` 立即返回 Session id；continuity key 会复用空闲的 Assignment 而不是再建一个；Assignment 的报告与提问通过 Bot Inbox 到达，答复会恢复正在等待的 Assignment（[ADR-0059](docs/adr/0059-assignment-collaboration-round-trips-through-the-bot-inbox.md)、[#180](https://github.com/BotHarness/BotHarness/issues/180)）。

- 创建 PersonaBot 现在会创建真实的 Git-backed Memory Repository，Orchestrator Session 直接在其中运行；重新打开仓库时不会把未提交的工作树改动自动提交（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- 移除模型可见的 `memory_read`、`memory_search`、`memory_write`、`memory_list` tools；V1 通过普通 file、Shell、grep 与 git 能力工作（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Session 在首次组装系统提示时会冻结其 persona：Human 对 `PERSONA.md` 的修改对新 Session 生效，运行中的 Session 保持原有的提示前缀（[ADR-0060](docs/adr/0060-system-prompt-prefix-is-append-only.md)、[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- PersonaBot DM 与 group Channel 现在可从所有 roster navigation surface 中隐藏，并可通过可搜索的“更多 → 隐藏的频道”Modal 恢复；隐藏不会改变 pin、section、order、消息、PersonaBot 或 Memory 状态（[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- Channel 与 section 的右键菜单现在提供和拖拽一致的整理能力：section 可上移、下移、重命名或安全移除；任意 group Channel 与 PersonaBot DM Channel 均可置顶/取消置顶、移动到现有或新建 section、重命名或隐藏。重命名 DM 会同步 PersonaBot 显示名，但稳定内部标识保持不变；真正删除 Channel/PersonaBot 的语义继续由 [#138](https://github.com/BotHarness/BotHarness/issues/138) 解决（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- group Channel 与 PersonaBot DM 现在都可通过右键菜单或拖拽置顶。空置顶区在静止时隐藏，仅在 Channel 开始拖拽后带 transition 展开；拖动置顶卡片会显示独立的虚线目标，只有放入该区域才会取消置顶并回到原位，拖到具体 Channel、section 或 section 间隙则取消置顶并保存预测线位置，普通列表空白处不再接受 drop。旧版 PersonaBot slug pin 也会迁移为 Channel ID（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- BOT mode 侧栏折叠后，现在会把所有已排序 Channel 投影到 36px rail：置顶 Channel 位于分隔线上方，普通 Channel 按与展开侧栏一致的 section/未分组扁平顺序继续排列；PersonaBot DM 保留头像，group Channel 使用 hash glyph，原生 hover card 显示身份信息与最新消息摘要（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

- Session 列表与 PersonaBot activity 改为通过显式、持久的 Session ownership 解析（含 fork 与 Subagent lineage），不再依赖 cwd 或 workspace 成员关系（[#80](https://github.com/BotHarness/BotHarness/issues/80)）。
- section header 现在可直接在该 section 内创建 group Channel 或 PersonaBot DM；新建 section、未分组 Channel 与 section 成员均默认出现在所属 scope 的第一位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

### Fixed

- 修复目录选择器被拒绝（如 Web 部署）时 Computer 的端到端导出：导出目录回退到内置默认（`~/Desktop/BotHarness Exports`，无 Desktop 时为 `~/BotHarness Exports`）并只读展示、无需输入路径；设置 scope 仍为空时行内持续跟踪该 Host 解析路径（打开目录 / 导出 / 导入对其保持可用）；选择器失败后直接切到该固定目录继续导出；导出完成后自动在宿主机文件管理器中打开目录。在有选择器的部署上，保存手工路径有进行中状态与成功/失败提示，相对路径会被明确拒绝，Host 拒绝写入时会显示错误而不是假成功（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- 本地 QA 启动器现在会识别已有的 DSH profile 凭据，并可一次性将 DeepSeek 密钥迁入受保护的本机共享来源；之后每个由 AX 启动的新 profile 都无需重新填写密钥。AX 指南要求以真实 DM 回复验证可用性（[#218](https://github.com/BotHarness/BotHarness/issues/218)）。

- Human Channel 消息发送失败后会保留明确的失败气泡；点击重试会把原文与附件恢复到输入区，由 Human 再次确认发送；Client message ID 同时保证响应丢失后的 Host 重试不会重复落盘（[#206](https://github.com/BotHarness/BotHarness/issues/206)）。
- 从回复引用定位到较早历史后，现在可通过正常向下滚动持续加载 newer pages，直到回到最新消息（[#207](https://github.com/BotHarness/BotHarness/issues/207)）。
- 已提交的 Channel placement 变更会让其他已打开窗口刷新 roster；拖拽预览仍只存在于当前窗口，远端窗口只重读权威提交状态（[#208](https://github.com/BotHarness/BotHarness/issues/208)）。
- PersonaBot Orchestrator 现在可通过附件引用按需读取 Channel 图片；可信 Host 会先校验成员关系、消息引用、MIME 与大小，不再让模型猜测宿主文件路径，也不会把所有历史图片自动塞入上下文（[#209](https://github.com/BotHarness/BotHarness/issues/209)）。
- 多行 Channel 输入区现在将上方整行留给输入框，把附件与发送按钮固定在底部 footer；只有从单行首次展开为多行时播放动效，后续逐行增高立即完成（[#148](https://github.com/BotHarness/BotHarness/issues/148)）。
- 修复新建 PersonaBot 自动打开 DM 后首条消息无法发送的问题；现在无需重新选择 Bot 或刷新页面即可发送（[#186](https://github.com/BotHarness/BotHarness/issues/186)）。
- PersonaBot DM 现在会随 Orchestrator 显式 `channel_send` 的生成过程预览回复，并在提交后替换为正式 Channel 消息；其他已提交消息也无需刷新即可显示，重连会补回遗漏的历史（[#141](https://github.com/BotHarness/BotHarness/issues/141)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- turn 运行期间不再把进行中的 side effect 报告为 `needs-repair`；被中断的 attempt 在启动时统一对账（已有 side effect → 需修复，否则可重试）（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- 修复置顶 Channel 拖到指定未分组位置时的重复 `topOrder` 项：现在会先移除 pin 前保留的旧位置，再插入预测线位置，取消置顶与移动会一起提交，不再回到原位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- 隐藏频道恢复 Modal 现在遵循 DeepSeek 原生 380px 宽度与 24px 内边距，收紧搜索框与列表间距及行高，按最近隐藏优先排列，并为搜索增加 180ms debounce；section 中除 Channel 行以外的整个区域（包括名称 label）均可打开 section 右键菜单（[#10](https://github.com/BotHarness/BotHarness/issues/10)、[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- 让 PersonaBot DM Channel 与 group Channel 遵循相同的 section、未分组位置、拖拽和移动规则，同时保留带头像的联系人行（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- 修复 flat order 的拖拽提交，使未置顶的 PersonaBot DM 能像 group Channel 一样持久地放在列表最顶端或两个 Channel section 之间（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- Channel 消息发送不再等待 PersonaBot 的 Orchestrator turn：Human 消息立即回显，可在 bot 工作中继续发送，并以 Bot Inbox 的形式入队、按序处理（[#140](https://github.com/BotHarness/BotHarness/issues/140)）。
- 修复 Computer 的 Chromium 在停止→启动后丢失标签页：桌面启动时自动打开浏览器并恢复上次会话，标签页在重启后与导出→导入后一样回来（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。

### Documentation

- 记录共享同一 GitHub 账号的 coding-agent task 如何认领 issue，并在 commit 与 PR 中保留可追溯的 task 标识（[#196](https://github.com/BotHarness/BotHarness/issues/196)）。

- 记录 Channel sidebar 为 Bot mode 的 scope 化右侧区域，采用统一注册、可折叠、按序排列的 entry seam，退役 PersonaBot navigation（[ADR-0053](docs/adr/0053-channel-sidebar-is-the-scoped-right-sidebar.md)、[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增 canonical Release Ledger、双语一致性检查与贡献指南（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。
- 记录规划中的 PersonaBot DM 导航，并将 application-defined Work 概念统一更名为 Assignment、Assignment Session、Assignment Agent 与 Assignment Directory；这是一项设计语言更新，不代表 UI 或 runtime 已经实现（[#109](https://github.com/BotHarness/BotHarness/pull/109)）。
- 发布双语 Development status 页面，将 DeepSeekBot 与 DSH Skill 的 release train 和 Changelog 明确分开（[#105](https://github.com/BotHarness/BotHarness/issues/105)）。
- 将 Memory 明确为 optional Git-backed Cordis Service，使 DM → Orchestrator → Assignment 主链不依赖 Persona 或 Memory（[ADR-0047](docs/adr/0047-memory-is-an-optional-git-backed-service.md)、[#74](https://github.com/BotHarness/BotHarness/issues/74)）。

## [Development] - 2026-09-20

汇总 DeepSeekBot 首个版本之前已经实现的基础能力与公开文档；这是开发历史，不代表已发布或可安装的版本。

### Added

- 新增持久的 PersonaBot identity、文件式 Memory 工具与 BOT mode 创建流程（[#22](https://github.com/BotHarness/BotHarness/pull/22)、[#98](https://github.com/BotHarness/BotHarness/pull/98)）。
- 新增 BOT mode Channel shell、roster sections、分 scope 排序与拖拽移动，并把陈列持久化到 Host（[#51](https://github.com/BotHarness/BotHarness/pull/51)、[#64](https://github.com/BotHarness/BotHarness/pull/64)、[#72](https://github.com/BotHarness/BotHarness/pull/72)、[#73](https://github.com/BotHarness/BotHarness/pull/73)、[#95](https://github.com/BotHarness/BotHarness/pull/95)）。

### Changed

- 让 plugin manifest、configuration path 与 client bridge 对齐已核验的 DSH contract（[#27](https://github.com/BotHarness/BotHarness/pull/27)）。

### Documentation

- 发布双语文档站、持续维护的 BotHarness 架构与产品术语，并为 plugin developer 提供稳定的 DSH/Cordis Context 与 Decision Tree（[#26](https://github.com/BotHarness/BotHarness/issues/26)、[#88](https://github.com/BotHarness/BotHarness/pull/88)、[#90](https://github.com/BotHarness/BotHarness/pull/90)、[#92](https://github.com/BotHarness/BotHarness/pull/92)）。
