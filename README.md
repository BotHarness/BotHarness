<div align="center">
  <img src="packages/client/assets/bot/deepseekbot-transparent.png" width="112" alt="DeepSeekBot 吉祥物" />

# BotHarness

**中文** ｜ [English](README.en.md)

[![MIT 许可](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![开发状态](https://img.shields.io/badge/status-source%20preview-orange)](#current-status)
[![GitHub stars](https://img.shields.io/github/stars/BotHarness/BotHarness?style=flat)](https://github.com/BotHarness/BotHarness)
[![文档](https://img.shields.io/badge/docs-botharness.ai-5865F2)](https://botharness.ai)
[![QQ 社区：1125565676](https://img.shields.io/badge/QQ-1125565676-12B7F5)](#community)

**一组有各自身份、人格和记忆的 bots，一起做事。**

</div>

BotHarness 在 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 中为 agent 提供持久身份。创建负责研究、设计或实现的 **PersonaBots**，分别私聊，或把它们带进 Group 协作。每个 Bot 保留自己的文件与历史，跨对话、Session 和 Workspace 延续。

**BotHarness** 是本仓库的插件层；**DeepSeekBot** 是首个应用，提供 Bot 名册、对话、记忆视图和委派。它基于 DSH 的 Plugin、Bundle 与 Session 能力构建；这里介绍的是 BotHarness 的产品能力，由社区插件交付。

[Git Memory](#git-memory) · [Group 协作](#groups) · [Computer 与 Browser use](#computer-and-browser-use) · [IM 身份](#im-identities) · [开始使用](#try-it) · [文档](#docs) · [社区](#community)

<a id="git-memory"></a>

## 看得见的 Git Memory

PersonaBot 的 Memory 是一个普通 Git 工作树。笔记、人格、代码和其他文件留在磁盘上，尚未提交的文件也是当前记忆。Bot 可以通过文件、搜索、Shell 和 Git 能力探索与更新记忆；你也可以使用自己的编辑器和 Git 工具。

![DSH 中 Mira 的记忆演化：右侧显示分支 Git graph 与提交历史，中央选中的展览方案 commit 展示逐行删改 diff](docs/assets/readme/memory-evolution.jpg)

_真实 DSH 截图，内容为虚构的展览笔记。graph 展示研究分支的合并；点击 commit，即可在历史旁查看文件 diff。[未裁切原图](docs/assets/readme/memory-evolution-full.jpg)。_

- **Memory files**：目录树与文件阅读器，菜单可以打开或定位 Host 上的真实文件，也能下载当前完整内容。
- **Memory evolution**：分支、commit 历史与当前改动。点击 commit 查看 diff，或检查尚未提交的修改；可选择易读的记忆术语或 Git 术语。
- **Recovery checkpoints**：为显式恢复保存上下文，保留 Git 作者与历史。也可以从已有 Git 仓库创建 Bot，复用其文件与历史。

远端仓库可通过普通 Git 操作使用；项目没有内置的一键自动远端同步服务。[记忆设计](docs/architecture/botharness-architecture.md) · [恢复决策](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)

<a id="groups"></a>

## 把不同的 bots 带进 Group

让研究员记住依据，让设计师推进体验，让工程师检查细节。Group 中的消息保留每个 Bot 自己的身份；需要某个 Bot 参与时，直接 @ 它。

![DSH 的 Group 邀请成员弹窗：选中 Nova，加入已有 Mira 和 Theo 的虚构 Observatory Studio 团队](docs/assets/readme/group-invite.jpg)

_打开 Members → Invite member，搜索或选择 PersonaBot，再发出邀请。Bot 默认自动加入，邀请本身不唤醒模型；也可以为 Bot 配置手动决策。_

![Mira、Theo 和 Nova 以各自身份在 Observatory Studio Group 协作，右侧同时显示成员列表](docs/assets/readme/group-collaboration.jpg)

_隔离本地 Group 中的真实模型回复：Mira 回顾访客需求，Theo 提出布局，Nova 阅读前两位的回复后补充实现与检查步骤。_

可为每个成员选择收件提醒方式：每条消息、摘要、仅直接提及，或静默收件。Bot 可以调整自己的 Group 提醒偏好，也可以离开 Group。私聊、Bot 间对话、Bot Inbox 与 Human Inbox 保留对话和待办入口。需要在项目中执行工作时，授予 Workspace，让 Bot 委派独立 **Assignments**，各自保留 Session 与报告。

<a id="computer-and-browser-use"></a>

## Computer use 与 Browser use

| 能力             | 当前已交付                                                                                                              | 启用条件与边界                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Computer use** | 通过 Cua Driver 观察、操作共享桌面，提供 VNC 观看与 Computer Audit。                                                    | 可选 `@botharness/computer` Bundle；当前运行容器桌面，需要 Docker。按 Bot 打开 Computer Access，每个 Session 首次动作请求授权。                                                            |
| **Browser use**  | 打开与观察网页；点击、输入、按键、滚动、等待、截图、上传文件与管理多标签。侧栏展示 Bot 当前网页，Human 可以暂停其操作。 | 可选 `@botharness/browser` Bundle；在 Host 上运行受管 Bot Browser。按 Bot 打开 Browser Access 并授权 Session；命名 browser profile 可保留不同登录数据，分配到同一 profile 的 Bots 共享它。 |

![已有 DSH QA 截图：命名 Bot Browser profile、实时网页预览与 Pause Bot 控件](docs/assets/pr/611-browser-profile-names/ui-completed.jpg)

_复用 [Browser profile 验证](https://github.com/BotHarness/BotHarness/pull/615) 截图：Bot 已读取本地测试页，预览与 Human 控件可用。_

标签归属决定某个 Bot 操作哪一页；同一 browser profile 中的标签不是安全隔离边界。Computer 与 Browser Access 独立控制。开发启动器包含这两个可选 Bundle，新 Bot 仍需显式开启对应 Access。[运行时设计](docs/architecture/botharness-architecture.md) · [Computer 契约](docs/architecture/computer-runtime-contracts.md)

<a id="im-identities"></a>

## 让 Bot 以自己的 IM 身份发言

IM 方向是将 PersonaBot 绑定到自己的平台 Bot 账号，让外部消息以该 Bot 获授权的身份发出。**飞书 / Lark 是首个正在推进的接入**，由 [dsh-im](https://github.com/xmanrui/dsh-im) 持有传输、凭据与连接生命周期。

当前交付边界：

- **已交付，需主动选择的开发路径**：Profile 绑定、显式出站授权与持久发送记录。隔离验证使用固定版本的临时 [dsh-im fork](docs/adr/0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md)；普通上游 npm `4.32.0` 缺少所需公开契约。已有出站证据是 **provider 接受**，不等于接收方已看到或阅读消息（[#117](https://github.com/BotHarness/BotHarness/issues/117)、[#624](https://github.com/BotHarness/BotHarness/pull/624)）。
- **仍在推进**：真实群组或 Thread 的 `@Bot` 进入对应 PersonaBot 的 Inbox 与 Orchestrator，再向同源回复（[#12](https://github.com/BotHarness/BotHarness/issues/12)）。provider 的提及与话题回复已有验证，但尚不能据此宣称完整产品链路已交付。
- **规划中**：外部 Channel/Inbox Bridge、普通消息收件、有限上下文读取与 Bot 主动选择跟随 Thread（[#48](https://github.com/BotHarness/BotHarness/issues/48)、[#629](https://github.com/BotHarness/BotHarness/issues/629)）。其他 IM 平台（包括 Slack、Discord、QQ 和微信）需要独立 provider 验证，此处不列为可用接入。

参见 [可选 IM 验证配置](docs/client-bridge.md#qualified-optional-im-provider)。默认安装不会启用这条外部发言路径。

<a id="current-status"></a>

## 当前状态

项目是 **源码预览**，基于固定的 **DSH 0.2.0-rc.1** 开发。本地 PersonaBot 创建、私聊与 Group、Git Memory、Assignment 委派、模型计划与用量视图、Computer use 和 Browser use 已有合并实现。这不代表已有稳定可下载的 BotHarness 发布：当前包仍为 private，下方方式从源码构建。

[双语 Release Ledger](CHANGELOG.md) 记录已交付变化；[Issues](https://github.com/BotHarness/BotHarness/issues) 与 [Projects](https://github.com/BotHarness/BotHarness/projects) 跟踪后续工作。持续维护的架构也包含目标设计与实现边界，设计页面本身不是交付承诺。

<a id="try-it"></a>

## 从源码开始使用

需要 **Node ≥22**（仓库固定 Node 24.21.0）和 **pnpm 12.4.2**。让 Bot 回复前，配置可用模型凭据；只有容器 Computer 需要 Docker。

```bash
git clone https://github.com/BotHarness/BotHarness.git
cd BotHarness
pnpm install
pnpm build
node scripts/dev-instance.mjs --home /tmp/botharness-demo --port 31967
```

选择一个全新的 `--home` 目录作为隔离 DSH Profile。helper 使用工作树固定的 CLI、链接本地 Bundles，验证已认证 API，并打印本地登录 URL。打开后进入 **Bot mode**，创建 PersonaBots、发送私聊，再建 Group 邀请成员。在 Bot 私聊的侧栏打开 **Memory files** 或 **Memory evolution**。

helper 可注入机器本地的 DeepSeek key，也可使用隔离 Profile 的凭据；密钥始终留在仓库外。模型配置、可选 IM 安装和 Client/Host 开发循环见 [本地实例指南](docs/client-bridge.md#7-本地开发环路dsh-020-rc1)。

<a id="docs"></a>

## 文档与开发

- [文档站](https://botharness.ai) · [介绍 Slides](https://botharness.ai/slides/s/botharness-intro)
- [产品术语](CONTEXT.zh.md) · [持续维护的架构与数据流](docs/architecture/botharness-architecture.md) · [架构决策](docs/adr/)
- [贡献指南](AGENTS.md) · [Release Ledger](CHANGELOG.md) · [DSH 官方文档](https://deepseek-harness.github.io/deepseek-harness/)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
pnpm dev:client    # 隔离本地 DSH Profile 的 Client 自动构建
pnpm docs:dev      # 文档预览：http://localhost:4321
```

稳定的本地文档域名：`pnpm dev` → `https://docs.botharness.localhost`（首次可能请求信任本地 CA）；免 sudo 方式为 `PORTLESS_PORT=8788 PORTLESS_HTTPS=0 pnpm dev`。文档页从仓库源文件生成，请修改源文件。Slides 位于 `apps/presentations`，用 `pnpm slides:dev` 迭代。

```text
packages/core         PersonaBot 身份、记忆、Messaging、Inbox、Assignments
packages/client       @botharness/ui：Bot 名册与宿主内交互
packages/computer     可选共享容器 Computer
packages/browser      可选受管 Bot Browser
packages/deepseekbot   DeepSeekBot Bundle
apps/docs             文档站
apps/presentations    介绍与其他 Slides
```

<a id="community"></a>

## 社区

在 QQ 中搜索群号 **1125565676** 加入社区。顶部徽章链接到这里；当前没有发布已验证的邀请链接或二维码。问题反馈、功能建议与开发讨论请使用 [GitHub Issues](https://github.com/BotHarness/BotHarness/issues)。

## 灵感与致谢

- [Grok Bot](https://x.ai/bot)：持久 Bot，以及像同事一样沟通和委派工作的产品灵感。
- [Rakazo](https://github.com/elie222/rakazo)：持久 AI 队友、对话与记忆体验参考。
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin)：Memory Git graph 分支线、提交列表与 diff 呈现参考。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：上游插件宿主。
- [dsh-im](https://github.com/xmanrui/dsh-im)、[dsh-lark-link](https://github.com/amlyczz/dsh-lark-link) 与 [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge)：IM 接入基础与可靠性、路由参考。

## 许可

MIT，见 [LICENSE](LICENSE)。Client Bundle 中分发的第三方素材见 [THIRD_PARTY_NOTICES.md](packages/client/THIRD_PARTY_NOTICES.md)。

## Star History

**BotHarness/BotHarness** 的实时 Star 历史，使用 [Star History 官方嵌入方式](https://www.star-history.com/blog/how-to-use-github-star-history/#how-to-embed-the-chart-in-your-readme)。

<a href="https://www.star-history.com/?repos=BotHarness%2FBotHarness&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;legend=top-left" />
    <img alt="BotHarness/BotHarness 按日期展示的 GitHub Star 增长历史" src="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;legend=top-left" />
  </picture>
</a>
