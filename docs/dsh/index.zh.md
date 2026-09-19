# DSH 与 Cordis 插件开发

可靠的 DSH 插件设计不是从 Host 或 Client 代码开始，而是先精确命名运行时对象，再为需求选择正确的 seam。这里是一份 foundation-first 指南——它本体是一份可安装的 agent skill，此处渲染给人类阅读。统一 Context 与 Decision Tree 之后，才按需进入 Host、Client 与 Slots 实现分支。

## 安装 skill

```sh
npx skills add BotHarness/dsh-skill
```

[`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) 是安装源：镜像 [`BotHarness/BotHarness`](https://github.com/BotHarness/BotHarness) 中的 skill 目录（本仓为 canonical），随 DSH 发版刷新。想手动接线？把 `SKILL.md` 与 `references/` 拷进 `.agents/skills/dsh-plugin-dev/` 即可。

## 内容

| 页面                                    | 内容                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| [规范 Context](/zh/dsh/context)         | DSH、Cordis 与 BotHarness leading words；原生与 proposed 边界                         |
| [Decision Tree](/zh/dsh/decision-tree)  | 在实现前选择 Service、Event、Registry、SessionEvent、Projection、存储、执行或 UI seam |
| [Bot Runtime 架构](/zh/dsh/bot-runtime) | 把产品 IM、PersonaBot/Work ownership、原生 Subagent delegation 分成三张图             |
| [完整指南](/zh/dsh/guide)               | Foundation-first 工作流、实现分支与十大坑位                                           |
| [Host 侧参考](/zh/dsh/host)             | 包清单、`cordis.patch.yml`、工具、事件、设置、凭据、生命周期                          |
| [Client 侧参考](/zh/dsh/client)         | `dsh.client`、客户端服务与 hooks、Typert/API Gateway、lazy-CJS 构建契约               |
| [槽位目录](/zh/dsh/slots)               | 全部 UI 槽位及其 kind、scope 与用途                                                   |
| [社区 UI 实践](/zh/dsh/patterns)        | 13 个社区插件怎么搭 UI——构建路线、验证过的实践、版本漂移风险                          |

## 诚实的边界

这里的内容来自某个固定版本的上游 DSH 源码与文档，外加经过验证的社区报告。DSH 处于开发者预览期：机制会变，上游的修复也可能让具体结论失效。因此每页都带出处栏——skill 版本、验证时的 DSH 版本与 commit、日期——同样的信息也随下载的 skill 一起走。完整调研笔记在仓库的 `docs/research/` 下。
