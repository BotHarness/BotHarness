# DSH 与 Cordis Context

可靠的 DSH 插件设计从精确术语与稳定架构边界开始。本节是可安装 `dsh-plugin-dev` skill 的 human-readable 版本：先用 Context 正确命名平台概念，再用 Decision Tree 为每项职责选择唯一的 primary seam。

## 安装 Skill

```sh
npx skills add BotHarness/dsh-skill
```

[`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) 镜像 [`BotHarness/BotHarness`](https://github.com/BotHarness/BotHarness) 中的 canonical skill 目录。也可以把唯一的英文 Agent authority `SKILL.md` 与 `references/` 拷进 `.agents/skills/dsh-plugin-dev/`。

## 稳定基础

| 页面                                   | 内容                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| [规范 Context](/zh/dsh/context)        | DSH/Cordis leading words、native 边界与概念图                                          |
| [Decision Tree](/zh/dsh/decision-tree) | 选择 Service、Event、Registry、SessionEvent、Projection、persistence 或 execution seam |
| [Release history](/zh/dsh/releases)    | 独立的 Skill SemVer，以及每个 release 所核验的 DSH revision                            |

本 Skill 有意不包含 Host 与 Client API 目录、Slot 清单或社区实现模式。这些细节变化很快：Decision Tree 选定 seam 后，应以当前 [DSH 官方文档](https://deepseek-harness.github.io/deepseek-harness/)、固定版本源码与实际运行的 Host 核验具体机制。

历史调查继续保留在 canonical 仓库的 `docs/research/` 下。它们是供维护者查证的证据，不是对外发布的 Skill 指南。

## 产品文档独立归属

本节只命名 DSH/Cordis 概念。BotHarness 的产品语言与架构归 `/dev`：[BotHarness 领域词表](/zh/dev/design/context) 负责产品定义，[运行时架构](/zh/dev/design/bot-runtime) 负责产品对象与 DSH 的关系。

## 出处

每个页面都会显示 Skill 版本、核验时的 DSH revision 与日期。DSH 仍处于开发者预览期；出处让证据可检查，但不会把某个具体 API 细节变成永久 contract。
