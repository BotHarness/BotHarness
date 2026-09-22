# DeepSeekBot 更新日志

这里记录 DeepSeekBot 值得关注的变化。添加或发布条目前，请先阅读
[Release Ledger 贡献指南](docs/agents/changelog.md)。

## [Unreleased]

推进首个 PersonaBot 工作流，交付 Assignment、共享动效控制与 Channel composer island。

### Added

- Bot 设置分区里的 Computer 分组支持在导出时选择目标目录，并可一键在宿主文件管理器中打开目录；当部署未挂载目录选择器时也可以手动输入路径（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- Bot 设置分区新增 Computer 分组：导出目录通过宿主原生目录 picker 选择、空闲停止时间就地编辑、导出/导入在同一页完成且都需显式授权；这些属于运行时设置，修改后无需重启 DSH（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- 新增分页 Channel 时间线：连续消息合并为气泡组；仅 Bot 消息展示头像，用户消息不显示头像，每组仅展示一次发送人和时间；提供复制、定位右键操作，向上加载历史时保持阅读位置，可跳转到新消息，并在再次打开时定位至上次实际读到的已提交消息附近（[#143](https://github.com/BotHarness/BotHarness/issues/143)、[ADR-0055](docs/adr/0055-channel-timeline-uses-opaque-cursors.md)）。
- 新增可选的 Computer 插件：在本地 Docker 中运行 profile 级共享的 Linux 桌面，以带 DSH 会话鉴权的 VNC 面板呈现在 Web Client 中；启动与停止都需显式授权，拉取镜像时展示实时进度，空闲自动停止，并支持把 Computer 的持久存储导出/导入为单个归档文件；PersonaBot 绑定与基于 Settings 的目录选择器仍是后续切片（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- 新增 Channel sidebar shell：Bot mode 右侧区域按统一注册 seam 渲染有序、可折叠的 entries（group 成员、DM 事项）（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增第一颗可由 Human 验收的 PersonaBot Assignment tracer bullet：PersonaBot 可通过 durable Bot Inbox 接收 DM，运行 Orchestrator 与独立 Assignment Session，由 Orchestrator 显式把 Assignment 结果发送回同一 Channel，并提供 Assignment 列表/详情视图；默认 Memory 与 Workspace Grant 行为仍是 [#81](https://github.com/BotHarness/BotHarness/issues/81) 的后续工作。
- 新增持久化的 BotHarness 动效偏好，提供跟随系统、减少动效与完整动效三种模式，并通过可访问的实时预览和唯一 effective policy 供 Client surfaces 共同消费（[#128](https://github.com/BotHarness/BotHarness/issues/128)）。
- 将 DM 与 group Channel composer 重构为响应式 floating island，支持多行输入，并提供可访问、仅消费投影的 PersonaBot activity region（[#129](https://github.com/BotHarness/BotHarness/issues/129)）。
- 为独立的 DeepSeekBot 与 DSH Skill release train 新增确定性、只读的 GitHub Release draft 准备流程（[指南](docs/agents/changelog.md#preparing-a-github-release-draft)、[#103](https://github.com/BotHarness/BotHarness/issues/103)）。

### Changed

- Bot 图标选择改为「所见即所得」的卡片网格：每张卡片直接展示图标外观，选中的卡片以边框强调，不再用只显示名字的 selector（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 文案全面跟随 DSH 语言，不再只有设置页：名册、分组管理、创建 PersonaBot、Channel sidebar entries、输入框与活动状态在英文界面下都显示英文（[#184](https://github.com/BotHarness/BotHarness/issues/184)）。

- 应用侧边栏的 Bot 模式切换按钮更高、图标与文字更大：再次点击整行会退出 Bot 模式，hover 时右侧出现设置齿轮，点击直接打开设置对话框的 Bot 分区（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- BotHarness 有了自己的 Bot 图标：应用侧边栏的「BOT 模式」入口与 Bot 设置分区的导航项默认显示 DeepSeekBot 吉祥物（含亮/暗两套图），新增的「Bot 图标」行可在吉祥物、简约版、生成形象与通用机器人图标之间切换（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 的偏好设置移入设置对话框中专属的 Bot 分区——界面动效与 BOT 列表排序两行从原生「通用设置」移出，Computer 的设置、导出/导入与资源上限随后也会落在这里（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- Computer 改为拉取上游 webtop 镜像（XFCE + Chromium），不再使用 BotHarness 自建的 Chrome 镜像，并以显式资源上限运行——默认 2 核 2 GiB 内存、swap 与上限相同、512 MB 共享内存、4096 进程，空闲 30 分钟自动停止，且都可按 Host 覆盖：镜像缩小约 470 MB，静置内存从约 2.4 GiB 降至约 1.15 GiB（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- PersonaBot Agent 现在会加入 agent preset（默认 `standard`），Orchestrator 因此在 Memory Repository 内具备普通 file、Shell、grep、git 工具，可以直接持久化记忆；Orchestrator 自行记录记忆、只把独立工作委托给 Assignment，而 Assignment 把值得记忆的内容回报给 Orchestrator，不写仓库（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Orchestrator 现在不必等待 Assignment 结束：`create_assignment` 立即返回 Session id；continuity key 会复用空闲的 Assignment 而不是再建一个；Assignment 的报告与提问通过 Bot Inbox 到达，答复会恢复正在等待的 Assignment（[ADR-0055](docs/adr/0055-assignment-collaboration-round-trips-through-the-bot-inbox.md)、[#180](https://github.com/BotHarness/BotHarness/issues/180)）。

- 创建 PersonaBot 现在会创建真实的 Git-backed Memory Repository，Orchestrator Session 直接在其中运行；重新打开仓库时不会把未提交的工作树改动自动提交（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- 移除模型可见的 `memory_read`、`memory_search`、`memory_write`、`memory_list` tools；V1 通过普通 file、Shell、grep 与 git 能力工作（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Session 在首次组装系统提示时会冻结其 persona：Human 对 `PERSONA.md` 的修改对新 Session 生效，运行中的 Session 保持原有的提示前缀（[ADR-0056](docs/adr/0056-system-prompt-prefix-is-append-only.md)、[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- PersonaBot DM 与 group Channel 现在可从所有 roster navigation surface 中隐藏，并可通过可搜索的“更多 → 隐藏的频道”Modal 恢复；隐藏不会改变 pin、section、order、消息、PersonaBot 或 Memory 状态（[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- Channel 与 section 的右键菜单现在提供和拖拽一致的整理能力：section 可上移、下移、重命名或安全移除；任意 group Channel 与 PersonaBot DM Channel 均可置顶/取消置顶、移动到现有或新建 section、重命名或隐藏。重命名 DM 会同步 PersonaBot 显示名，但稳定内部标识保持不变；真正删除 Channel/PersonaBot 的语义继续由 [#138](https://github.com/BotHarness/BotHarness/issues/138) 解决（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- group Channel 与 PersonaBot DM 现在都可通过右键菜单或拖拽置顶。空置顶区在静止时隐藏，仅在 Channel 开始拖拽后带 transition 展开；拖动置顶卡片会显示独立的虚线目标，只有放入该区域才会取消置顶并回到原位，拖到具体 Channel、section 或 section 间隙则取消置顶并保存预测线位置，普通列表空白处不再接受 drop。旧版 PersonaBot slug pin 也会迁移为 Channel ID（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- BOT mode 侧栏折叠后，现在会把所有已排序 Channel 投影到 36px rail：置顶 Channel 位于分隔线上方，普通 Channel 按与展开侧栏一致的 section/未分组扁平顺序继续排列；PersonaBot DM 保留头像，group Channel 使用 hash glyph，原生 hover card 显示身份信息与最新消息摘要（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

- Session 列表与 PersonaBot activity 改为通过显式、持久的 Session ownership 解析（含 fork 与 Subagent lineage），不再依赖 cwd 或 workspace 成员关系（[#80](https://github.com/BotHarness/BotHarness/issues/80)）。
- section header 现在可直接在该 section 内创建 group Channel 或 PersonaBot DM；新建 section、未分组 Channel 与 section 成员均默认出现在所属 scope 的第一位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

### Fixed

- 修复新建 PersonaBot 自动打开 DM 后首条消息无法发送的问题；现在无需重新选择 Bot 或刷新页面即可发送（[#186](https://github.com/BotHarness/BotHarness/issues/186)）。
- PersonaBot DM 现在会随 Orchestrator 显式 `channel_send` 的生成过程预览回复，并在提交后替换为正式 Channel 消息；其他已提交消息也无需刷新即可显示，重连会补回遗漏的历史（[#141](https://github.com/BotHarness/BotHarness/issues/141)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- turn 运行期间不再把进行中的 side effect 报告为 `needs-repair`；被中断的 attempt 在启动时统一对账（已有 side effect → 需修复，否则可重试）（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- 修复置顶 Channel 拖到指定未分组位置时的重复 `topOrder` 项：现在会先移除 pin 前保留的旧位置，再插入预测线位置，取消置顶与移动会一起提交，不再回到原位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- 隐藏频道恢复 Modal 现在遵循 DeepSeek 原生 380px 宽度与 24px 内边距，收紧搜索框与列表间距及行高，按最近隐藏优先排列，并为搜索增加 180ms debounce；section 中除 Channel 行以外的整个区域（包括名称 label）均可打开 section 右键菜单（[#10](https://github.com/BotHarness/BotHarness/issues/10)、[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- 让 PersonaBot DM Channel 与 group Channel 遵循相同的 section、未分组位置、拖拽和移动规则，同时保留带头像的联系人行（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- 修复 flat order 的拖拽提交，使未置顶的 PersonaBot DM 能像 group Channel 一样持久地放在列表最顶端或两个 Channel section 之间（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- Channel 消息发送不再等待 PersonaBot 的 Orchestrator turn：Human 消息立即回显，可在 bot 工作中继续发送，并以 Bot Inbox 的形式入队、按序处理（[#140](https://github.com/BotHarness/BotHarness/issues/140)）。

### Documentation

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
