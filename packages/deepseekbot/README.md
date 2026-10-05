<div align="center">
  <a href="https://deepseekbot.botharness.ai/en/"><img src="https://raw.githubusercontent.com/BotHarness/BotHarness/main/docs/assets/readme/deepseekbot-og-en-v2.png" width="800" alt="DeepSeekBot: the open-source Grok Bot alternative. Built on DeepSeek Harness, works with DSH plugins, Lark, Slack, Discord and WeChat, MIT" /></a>

# DeepSeekBot

[![npm](https://img.shields.io/npm/v/deepseekbot?color=CB3837&logo=npm)](https://www.npmjs.com/package/deepseekbot)
[![Website](https://img.shields.io/badge/website-deepseekbot.botharness.ai-3D5AFE)](https://deepseekbot.botharness.ai/en/)
[![GitHub](https://img.shields.io/github/stars/BotHarness/BotHarness?style=flat&logo=github)](https://github.com/BotHarness/BotHarness)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/BotHarness/BotHarness/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/aEB2Ayhu7B)

**The open-source Grok Bot alternative for DeepSeek Harness.**
A crew of bots, each with its own identity, persona and memory, working together.

[Website](https://deepseekbot.botharness.ai/en/) · [GitHub](https://github.com/BotHarness/BotHarness) · [Docs](https://botharness.ai) · [中文](#中文)

</div>

DeepSeekBot installs into [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) as one plugin: a Bot roster, DMs and Groups, Git Memory you can see, delegation, and IM identities of the Bots' own.

- **Open-source Grok Bot alternative**, MIT licensed
- **Built on DeepSeek Harness**: any model provider you connect in DSH works
- **Works with other DSH plugins** in the same Profile
- **Lark / Feishu, Slack, Discord and WeChat**: Bots speak under their own identity

## Install

**Desktop:** in the DeepSeek Harness desktop app, go to **Plugins → Add plugin**, enter `deepseekbot`, keep the official npm registry and click **Install**, then **Enable now**. **Bot mode** appears in the sidebar.

**CLI:** needs Node 22+ and the DSH 0.2 line from `0.2.0-rc.1`.

```bash
npm i -g @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add deepseekbot
dsh web
```

Open **Bot mode**, create a PersonaBot, DM it, then start a Group and invite members. To use Lark, Slack, Discord or WeChat, connect the app in **Settings → IM bots**, then bind the identity and authorize a group in the Bot's Profile. Accounts start disconnected; you turn each one on.

## Every Bot is a colleague

- **Lasting identity:** each PersonaBot keeps its own name, persona (PERSONA.md) and avatar across chats, Sessions and Workspaces.
- **Git Memory you can see:** a Bot's memory is a plain Git working tree. Browse files, branches, commits and diffs in the sidebar, or push it to GitHub to share it across machines.
- **Groups:** messages keep each Bot's identity, and you @ whoever you need.
- **Assignments:** grant a Workspace and a Bot can delegate independent Assignments, each with its own Session and report.
- **Their own IM identity:** when mentioned in an authorized group or thread, a Bot replies there under its own identity.

<img src="https://raw.githubusercontent.com/BotHarness/BotHarness/main/docs/assets/readme/memory-evolution.jpg" width="800" alt="Memory evolution in DSH: Git graph, commit history and a line diff of a Bot's memory" />

<img src="https://raw.githubusercontent.com/BotHarness/BotHarness/main/docs/assets/readme/group-collaboration.jpg" width="800" alt="Three PersonaBots replying under their own identities in a Group" />

## Pixel avatars

<img src="https://raw.githubusercontent.com/BotHarness/BotHarness/main/docs/assets/readme/pixel-avatars-crew.gif" width="660" alt="Six pixel-art PersonaBot avatars" />

Every Bot's default avatar is generated from its name, and while a Bot works its avatar morphs into the tool it is using. Try it on the [website](https://deepseekbot.botharness.ai/en/#avatar); avatars come from [BotPixel](https://github.com/BotHarness/BotPixel).

## Built on DeepSeek Harness

DeepSeekBot runs on DSH's own session management and harness, so any LLM provider you connect in DSH works for your Bots, and it installs alongside other DSH plugins. Some plugins may not be compatible yet; please open an [issue](https://github.com/BotHarness/BotHarness/issues) or a PR if you hit one.

## Community

- Discord: [discord.gg/aEB2Ayhu7B](https://discord.gg/aEB2Ayhu7B)
- QQ group: 1125565676
- Issues: [github.com/BotHarness/BotHarness/issues](https://github.com/BotHarness/BotHarness/issues)

---

<a id="中文"></a>

## 中文

<a href="https://deepseekbot.botharness.ai"><img src="https://raw.githubusercontent.com/BotHarness/BotHarness/main/docs/assets/readme/deepseekbot-og-zh-v2.png" width="800" alt="DeepSeekBot：开源的 GrokBot 平替" /></a>

**开源的 GrokBot 平替。一组有各自身份、人格和记忆的 bots，一起做事。**

DeepSeekBot 以一个插件装进 DeepSeek Harness（DSH）：Bot 名册、私聊与 Group、看得见的 Git Memory、任务委派，以及 Bot 自己的 IM 身份（飞书 / Lark、Slack、Discord、微信）。它直接用 DSH 的 Session 管理和 Harness，你在 DSH 里接入的任何模型 provider 都能用，也能和其他 DSH 插件装在一起。

**桌面端**：打开 DeepSeek Harness，点「插件 → 添加插件」，在「包名或地址」里输入 `deepseekbot`，点「安装」，再点「立即启用」。

**命令行**：

```bash
npm i -g @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add deepseekbot
dsh web
```

官网：[deepseekbot.botharness.ai](https://deepseekbot.botharness.ai) · 源码：[GitHub](https://github.com/BotHarness/BotHarness) · Discord：[加入](https://discord.gg/aEB2Ayhu7B) · QQ 群：1125565676

---

## Package notes

This product Bundle combines BotHarness Core (`@botharness/core`), Client (`@botharness/ui`) and the independently versioned, qualified IM Provider (`@botharness/im-provider`, maintained from [dsh-im](https://github.com/xmanrui/dsh-im) under its MIT license). The Provider updates with the product, without an independent upstream auto-update. The optional Computer and Browser Bundles are not part of this package; they are available from source.

If an existing Profile enables standalone `@xmanrui/dsh-im` or `@botharness/im-provider` as another Bundle, remove that separate Bundle before enabling DeepSeekBot. Removing a Bundle keeps its stored account configuration and credentials; revalidate the retained Bot bindings and group authorization afterwards.

MIT © BotHarness
