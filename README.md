<div align="center">
  <a href="https://deepseekbot.botharness.ai"><img src="docs/assets/readme/deepseekbot-og-zh-v2.png" width="800" alt="DeepSeekBot：开源的 GrokBot 平替。基于 DeepSeek Harness，兼容其他 DSH 插件，连接飞书、Slack、Discord 和微信，MIT 开源" /></a>

# DeepSeekBot

**中文** ｜ [English](README.en.md)

[![npm](https://img.shields.io/npm/v/deepseekbot?color=CB3837&logo=npm)](https://www.npmjs.com/package/deepseekbot)
[![官网](https://img.shields.io/badge/官网-deepseekbot.botharness.ai-3D5AFE)](https://deepseekbot.botharness.ai)
[![MIT 许可](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-加入-5865F2?logo=discord&logoColor=white)](https://discord.gg/aEB2Ayhu7B)
[![QQ 群：1125565676](https://img.shields.io/badge/QQ-1125565676-12B7F5)](#community)
[![GitHub stars](https://img.shields.io/github/stars/BotHarness/BotHarness?style=flat)](https://github.com/BotHarness/BotHarness)

**开源的 GrokBot 平替。一组有各自身份、人格和记忆的 bots，一起做事。**

[官网](https://deepseekbot.botharness.ai) · [安装](#install) · [能力](#features) · [像素头像](#pixel-avatars) · [社区](#community) · [文档](https://botharness.ai)

</div>

DeepSeekBot 以一个 npm 包装进 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness)：Bot 名册、私聊与 Group、看得见的 Git Memory、任务委派，以及 Bot 自己的 IM 身份。创建负责研究、设计或实现的 **PersonaBots**，分别私聊，或把它们带进 Group 协作；每个 Bot 保留自己的文件与历史，跨对话、Session 和 Workspace 延续。

- **GrokBot 的开源平替**，MIT 开源
- **基于 DeepSeek Harness**，你在 DSH 里接入的任何模型 provider 都能用
- **兼容其他 DSH 插件**，可以和它们装在同一个 Profile
- **连接飞书 / Lark、Slack、Discord 和微信**，Bot 用自己的身份发言

本仓库是 **BotHarness**：为 DSH agent 提供持久身份的插件层，DeepSeekBot 是它的首个产品。

<a id="install"></a>

## 安装

**桌面端**：打开 DeepSeek Harness 桌面端，点「插件 → 添加插件」，在「包名或地址」里输入 `deepseekbot`，保持「npm 官方源」，点「安装」。显示「已安装」后点「立即启用」（提示重启时重启当前 Profile），侧栏会出现「Bot 模式」。还没装 DSH？先[下载桌面端](https://www.deepseek.com/en/harness/)。

**开发者（命令行）**：需要 Node 22 以上，支持 DSH `0.2.0-rc.1` 起的 0.2 系列。

```bash
npm i -g @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add deepseekbot
dsh web
```

打开后进入 **Bot mode**，创建 PersonaBot，先私聊，再建 Group 邀请成员。要接入飞书、Slack、Discord 或微信，到「设置 → IM bots」连接应用，再在 Bot 的 Profile 里绑定身份、授权群组。安装后账号默认不连接，由你逐个开启。想先试试又不想动现有配置，可以换一个新的 Profile 名字。参见 [DSH 官方文档：打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。

<a id="features"></a>

## 每个 Bot 都是一位同事

| 能力                        | 说明                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **持久身份**                | 每个 PersonaBot 有自己的名字、人格（PERSONA.md）和头像，跨对话、Session 与 Workspace 延续。                                     |
| **看得见的 Git Memory**     | Bot 的记忆是一个普通 Git 工作树。在侧栏浏览文件、分支、commit 历史与 diff，也能推到 GitHub，在多台机器之间共享同一份记忆。      |
| **Group 协作**              | 消息保留各自身份，需要谁就 @ 谁。每个成员可以选择每条提醒、摘要、仅提及或静默。                                                 |
| **Assignments 委派**        | 授予 Workspace 后，Bot 可以委派独立的 Assignment，各自保留 Session 与报告；需要你回答或批准时，侧栏会显示待办数。               |
| **自己的 IM 身份**          | 在飞书 / Lark、Slack、Discord 和微信里绑定 Bot 自己的身份，被 @ 时在原话题里回复。只有你授权过的群和频道才会进入 Bot 的 Inbox。 |
| **Computer 与 Browser use** | 操作共享桌面（需要 Docker）或受管浏览器，你能实时观看，也能暂停它的浏览器操作。源码版可选。                                     |

<a id="git-memory"></a>

## 看得见的 Git Memory

PersonaBot 的 Memory 是一个普通 Git 工作树。笔记、人格、代码和其他文件留在磁盘上，尚未提交的文件也是当前记忆。Bot 可以通过文件、搜索、Shell 和 Git 能力探索与更新记忆；你也可以使用自己的编辑器和 Git 工具。

![DSH 中 Mira 的记忆演化：右侧显示分支 Git graph 与提交历史，中央选中的展览方案 commit 展示逐行删改 diff](docs/assets/readme/memory-evolution.jpg)

_真实 DSH 截图，内容为虚构的展览笔记。graph 展示研究分支的合并；点击 commit，即可在历史旁查看文件 diff。[未裁切原图](docs/assets/readme/memory-evolution-full.jpg)。_

- **Memory files**：目录树与文件阅读器，菜单可以打开或定位 Host 上的真实文件，也能下载当前完整内容。
- **Memory evolution**：分支、commit 历史与当前改动。点击 commit 查看 diff，或检查尚未提交的修改；可选择易读的记忆术语或 Git 术语。
- **Recovery checkpoints**：为显式恢复保存上下文，保留 Git 作者与历史。也可以从已有 Git 仓库创建 Bot，复用其文件与历史。

把记忆推到 GitHub 等 Git 远端，就能在多台机器、多个 DSH 之间共享同一份记忆。[记忆设计](docs/architecture/botharness-architecture.md) · [恢复决策](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)

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

> 这两个 Bundle 目前只在源码版中可选，不包含在 npm 上的 `deepseekbot` 包里。

| 能力             | 当前已交付                                                                                                              | 启用条件与边界                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Computer use** | 通过 Cua Driver 观察、操作共享桌面，提供 VNC 观看与 Computer Audit。                                                    | 可选 `@botharness/computer` Bundle；当前运行容器桌面，需要 Docker。按 Bot 打开 Computer Access，Auto-allow 关闭时，每个 Session 首次动作请求授权。                                                           |
| **Browser use**  | 打开与观察网页；点击、输入、按键、滚动、等待、截图、上传文件与管理多标签。侧栏展示 Bot 当前网页，Human 可以暂停其操作。 | 可选 `@botharness/browser` Bundle；在 Host 上运行受管 Bot Browser。按 Bot 打开 Browser Access；Auto-allow 关闭时需授权 Session；命名 browser profile 可保留不同登录数据，分配到同一 profile 的 Bots 共享它。 |

![已有 DSH QA 截图：命名 Bot Browser profile、实时网页预览与 Pause Bot 控件](docs/assets/pr/611-browser-profile-names/ui-completed.jpg)

_复用 [Browser profile 验证](https://github.com/BotHarness/BotHarness/pull/615) 截图：Bot 已读取本地测试页，预览与 Human 控件可用。_

每个 Bundle 的 DSH Profile 配置 `autoAllowActions` 默认关闭。开启后，该 Bundle 的操作跳过逐 Session 授权，但仍需按 Bot 开启对应 Access。

标签归属决定某个 Bot 操作哪一页；同一 browser profile 中的标签不是安全隔离边界。Computer 与 Browser Access 独立控制。开发启动器包含这两个可选 Bundle，新 Bot 仍需显式开启对应 Access。[运行时设计](docs/architecture/botharness-architecture.md) · [Computer 契约](docs/architecture/computer-runtime-contracts.md)

<a id="im-identities"></a>

## 让 Bot 以自己的 IM 身份发言

把 PersonaBot 绑定到自己的平台 Bot 账号，外部消息就以这个 Bot 获授权的身份发出。已支持 **飞书 / Lark、Slack、Discord 和微信**，连接由 DeepSeekBot 随包管理的 IM Provider（维护自 [dsh-im](https://github.com/xmanrui/dsh-im)）负责传输、凭据与连接生命周期。

- 在群聊或话题里 @Bot，消息进入该 PersonaBot 的 Inbox，由它在原话题回复。
- 只有你授权过的群和频道才会进入 Bot 的 Inbox；出站发送需要显式授权，并留有发送记录。
- 可以按 Bot 设置收件方式：只响应提及、按数量或时间汇总普通消息，或立即唤醒。

连接指南：[飞书 / Lark](docs/lark-connection.zh.md) · [Slack](docs/slack-connection.zh.md)。

<a id="pixel-avatars"></a>

## 像素头像：输入名字，得到一张脸

<img src="docs/assets/readme/pixel-avatars-crew.gif" width="660" alt="六个像素风 PersonaBot 头像" />

每个 Bot 的默认头像都由名字生成：同一个名字，在哪里都是同一张脸。Bot 工作时，头像会一颗像素一颗像素地变成它正在用的工具（读文件、终端、搜索、等你批准……）。到[官网](https://deepseekbot.botharness.ai/#avatar)输入名字试试，还能下载高清头像。头像来自开源的 [BotPixel](https://github.com/BotHarness/BotPixel)（`@botharness/pixel-avatar` 与 `@botharness/pixel-morph`）。

<a id="dsh"></a>

## 站在 DeepSeek Harness 上

DeepSeekBot 直接用 DSH 自己的 Session 管理和 Harness：你在 DSH 里接入的任何 LLM 模型 provider，Bot 都能用；也可以和其他 DSH 插件装在一起。个别插件可能还不兼容，遇到了欢迎提 [Issue](https://github.com/BotHarness/BotHarness/issues) 或 PR。

[双语 Release Ledger](CHANGELOG.md) 记录每个版本的变化；[Issues](https://github.com/BotHarness/BotHarness/issues) 与 [Projects](https://github.com/BotHarness/BotHarness/projects) 跟踪后续工作。

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

选择一个全新的 `--home` 目录作为隔离 DSH Profile。helper 使用工作树固定的 CLI、链接本地 Bundles（包括可选的 Computer 与 Browser），验证已认证 API，并打印本地登录 URL。打开后进入 **Bot mode**，创建 PersonaBots、发送私聊，再建 Group 邀请成员。在 Bot 私聊的侧栏打开 **Memory files** 或 **Memory evolution**。

helper 可注入机器本地的 DeepSeek key，也可使用隔离 Profile 的凭据；密钥始终留在仓库外。模型配置、可选 IM 安装和 Client/Host 开发循环见 [本地实例指南](docs/client-bridge.md#7-本地开发环路dsh-020-rc1)。

<a id="docs"></a>

## 文档与开发

- [DeepSeekBot 官网](https://deepseekbot.botharness.ai) · [文档站](https://botharness.ai) · [介绍 Slides](https://botharness.ai/slides/s/botharness-intro)
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

问题、想法，还有你做出来的 Bot，都欢迎带来。

- **Discord**：[加入 DeepSeekBot 服务器](https://discord.gg/aEB2Ayhu7B)
- **QQ 群**：在 QQ 中搜索群号 **1125565676**
- **问题反馈与功能建议**：[GitHub Issues](https://github.com/BotHarness/BotHarness/issues)

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
