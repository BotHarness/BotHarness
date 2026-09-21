# DeepSeekBot 更新日志

这里记录 DeepSeekBot 值得关注的变化。添加或发布条目前，请先阅读
[Release Ledger 贡献指南](docs/agents/changelog.md)。

## [Unreleased]

推进首个 PersonaBot 工作流，交付 Assignment、共享动效控制与 Channel composer island。

### Added

- 新增 Channel sidebar shell：Bot mode 右侧区域按统一注册 seam 渲染有序、可折叠的 entries（group 成员、DM 事项）（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增第一颗可由 Human 验收的 PersonaBot Assignment tracer bullet：PersonaBot 可通过 durable Bot Inbox 接收 DM，运行 Orchestrator 与独立 Assignment Session，由 Orchestrator 显式把 Assignment 结果发送回同一 Channel，并提供 Assignment 列表/详情视图；默认 Memory 与 Workspace Grant 行为仍是 [#81](https://github.com/BotHarness/BotHarness/issues/81) 的后续工作。
- 新增持久化的 BotHarness 动效偏好，提供跟随系统、减少动效与完整动效三种模式，并通过可访问的实时预览和唯一 effective policy 供 Client surfaces 共同消费（[#128](https://github.com/BotHarness/BotHarness/issues/128)）。
- 将 DM 与 group Channel composer 重构为响应式 floating island，支持多行输入，并提供可访问、仅消费投影的 PersonaBot activity region（[#129](https://github.com/BotHarness/BotHarness/issues/129)）。
- 为独立的 DeepSeekBot 与 DSH Skill release train 新增确定性、只读的 GitHub Release draft 准备流程（[指南](docs/agents/changelog.md#preparing-a-github-release-draft)、[#103](https://github.com/BotHarness/BotHarness/issues/103)）。

### Changed

- PersonaBot DM 行现在既可通过右键菜单置顶，也可拖入常驻置顶区；置顶卡片可拖回高亮的普通列表以取消置顶，两条路径都不会丢失 DM 原有的 section 或未分组位置（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- section header 现在可直接在该 section 内创建 group Channel 或 PersonaBot DM；新建 section、未分组 Channel 与 section 成员均默认出现在所属 scope 的第一位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

### Fixed

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
