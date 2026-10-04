# DSH Skill 更新日志

这里记录可安装 DSH/Cordis Context 与 Decision Tree 值得关注的变化。Skill SemVer 标识本
artifact；DSH 版本与上游 revision 记录这些内容是基于什么版本完成核验的。

## [Unreleased]

独立于下游产品版本，准备下一个 DSH Skill release。

### Documentation

- 在[本地开发指南](../dsh-dev/SKILL.md)记录隔离启动超时后遗留重复 Host 导致 operational writer 租约拒绝的情况；通过 DSH 0.2.0 RC1 的 Assignment 容量 QA 验证（[#811](https://github.com/BotHarness/BotHarness/issues/811)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录原生 Tool 批准与实际 Shell 执行需要分别取证；保留真实 Orchestrator 工作区拒绝，并在 DSH 0.2.0 RC1 验证已授权 Assignment 执行 ([#751](https://github.com/BotHarness/BotHarness/issues/751)).

- 在[调试手册](../dsh-dev/references/debugging-playbook.md)记录外部回复连接与收件范围的区别，以固定 Provider 契约和独立绑定的回复身份检查（[#637](https://github.com/BotHarness/BotHarness/issues/637)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 WebServer prefix 的斜杠匹配与原始 HTTP peer 边界，已核对固定 DSH 0.2.0 RC1 源码并通过真实扩展配对／观察流程验证（[#741](https://github.com/BotHarness/BotHarness/issues/741)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 native configForms scope 方法的 receiver 绑定要求，并在固定 DSH 0.2.0 RC1 原生设置和 Host 重启后的 Browser Target 持久化中验证（[#726](https://github.com/BotHarness/BotHarness/issues/726)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录目录选择器的能力差异及原生选择回退，通过固定 DSH 0.2.0 RC1 的真实 Inbox Grant 流程验证（[#552](https://github.com/BotHarness/BotHarness/issues/552)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录原生审批探针必须位于 open Turn 的要求，已核对固定 DSH 0.2.0 RC1 源码，并通过真实 Browser 审批及取消 Turn 验证（[#460](https://github.com/BotHarness/BotHarness/issues/460)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录隔离 Provider 激活顺序、原生 Consumer 捕获 Policy 与真正的 Tool 执行边界，经固定 DSH 0.2.0 RC1 的原生文件与审批 Shell 调用验证（[#632](https://github.com/BotHarness/BotHarness/issues/632)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)澄清原生 token 投影的汇总字段及失败调用的请求路由归属，通过 DSH 0.2.0 RC1 的真实 Assignment 与子代理调用完成核验（[#503](https://github.com/BotHarness/BotHarness/issues/503)）。

- 记录隔离开发 Profile 重启时保留可选 Bundle 的行为（[#117](https://github.com/BotHarness/BotHarness/issues/117)）。
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
