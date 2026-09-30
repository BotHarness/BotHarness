# DSH Skill 更新日志

这里记录可安装 DSH/Cordis Context 与 Decision Tree 值得关注的变化。Skill SemVer 标识本
artifact；DSH 版本与上游 revision 记录这些内容是基于什么版本完成核验的。

## [Unreleased]

独立于下游产品版本，准备下一个 DSH Skill release。

### Documentation

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 provider token 分项的可选性及 Assistant 实际来源路由，避免把缺失报告当作零或估算用量（[#499](https://github.com/BotHarness/BotHarness/issues/499)）。
- 在[本地开发指南](../dsh-dev/SKILL.md)记录应用预留的 Session ID 与已持久化 DSH Session 的区别，保证执行前拒绝在修复后可以重试（[#500](https://github.com/BotHarness/BotHarness/issues/500)）。

- 为 DSH Skill 建立独立的双语 Release Ledger（[#102](https://github.com/BotHarness/BotHarness/issues/102)）。

## [0.3.4] - 2026-09-20

将可安装 skill 聚焦于稳定的 DSH/Cordis 术语与架构决策。

- **Skill 版本：** `0.3.4`
- **核验的 DSH 版本：** `dsh 0.1.6-alpha.2`
- **上游 revision：** [`ddefc45fbc7f8e46dd73185e68295696d1297887`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)

### Changed

- 将 Context 与 Decision Tree 聚焦在稳定的 DSH/Cordis seam，并把版本相关 API 留给当前上游文档与源码核验（[#26](https://github.com/BotHarness/BotHarness/issues/26)）。
