# DSH 插件开发

一个 DeepSeek Harness 插件有前后两个半场：**host 半场**注册工具、服务、事件与设置；**client 半场**通过 RPC 把 UI 画进官方槽位。这里是全栈开发指南——它本体是一份可安装的 agent skill，此处渲染给人类阅读。

## 安装 skill

```sh
npx skills add BotHarness/dsh-skill
```

[`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) 是安装源：镜像 [`BotHarness/BotHarness`](https://github.com/BotHarness/BotHarness) 中的 skill 目录（本仓为 canonical），随 DSH 发版刷新。想手动接线？把 `SKILL.md` 与 `references/` 拷进 `.agents/skills/dsh-plugin-dev/` 即可。

## 内容

| 页面                             | 内容                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| [完整指南](/zh/dsh/guide)        | 心智模型、扩展点决策表、host / client 两条工作流、十大坑位    |
| [Host 侧参考](/zh/dsh/host)      | 包清单、`cordis.patch.yml`、工具、事件、设置、凭据、生命周期  |
| [Client 侧参考](/zh/dsh/client)  | `dsh.client`、客户端服务与 hooks、通用 RPC、lazy-CJS 构建契约 |
| [槽位目录](/zh/dsh/slots)        | 全部 UI 槽位及其 kind、scope 与用途                           |
| [社区 UI 实践](/zh/dsh/patterns) | 13 个社区插件怎么搭 UI——构建路线、验证过的实践、版本漂移风险  |

## 诚实的边界

这里的内容来自某个固定版本的上游 DSH 源码与文档，外加经过验证的社区报告。DSH 处于开发者预览期：机制会变，上游的修复也可能让具体结论失效。因此每页都带出处栏——skill 版本、验证时的 DSH 版本与 commit、日期——同样的信息也随下载的 skill 一起走。完整调研笔记在仓库的 `docs/research/` 下。
