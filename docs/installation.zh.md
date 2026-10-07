# 安装 DeepSeekBot

在 DeepSeek Harness（DSH）中安装 **DeepSeekBot** 插件，启用后创建第一个 PersonaBot。只需安装一个产品包，Core、Client 和已验证的 IM Provider 会随包一起安装。

本页安装公共 npm 包 **`deepseekbot`**，实际验证环境是 **DSH `0.2.0-rc.1`**。截图来自干净 Profile 的真实中文界面；安装不需要克隆仓库或本地编译。

## 1. 打开插件管理器

启动 DSH 并打开 Web 界面。尚未安装 DSH 时，先按 [DSH 官方入门文档](https://deepseek-harness.github.io/deepseek-harness/)准备环境。先按 [API 与 Bot 模型教程](/zh/docs/model-setup) 配置 Provider；创建 Bot 后还需要在其 Profile 应用模型预设。

点击左侧 **插件**，再点击 **添加插件**。

![DSH 左侧的插件入口](/guides/install/01-dsh-entry-zh.webp)

## 2. 填入公开包名

在 **包名或地址** 中粘贴完整内容：

```text
deepseekbot
```

安装源保持 **npm 官方源**，点击 **安装**，等待安装任务完成。

![添加插件窗口中填写 npm 包名](/guides/install/02-install-source-zh.webp)

_这里通过来源地址导入插件，没有文件上传选择器。只填包名会安装最新正式版（截图里是早先固定的版本号）；想固定版本可以写成 `deepseekbot@<版本号>`。_

## 3. 启用已安装插件

安装完成后，窗口显示 **已安装**、包名和已安装的版本。点击 **立即启用**。如果已经关闭窗口，也可以回到插件页，打开 **启用 deepseekbot** 开关。

![实际安装成功，显示版本和立即启用按钮](/guides/install/03-installed-zh.webp)

启用后，左侧会出现 **Bot 模式**。本次 RC1 验证中插件立即加载；如果你的 DSH 提示需要重启，请重启同一个 Profile，再打开 Web 页面。

![deepseekbot 已启用，左侧出现 Bot 模式入口](/guides/install/04-enabled-zh.webp)

## 4. 进入 Bot 模式

点击 **Bot 模式**，再点击 **创建第一个 PersonaBot**。填写名称并点击 **创建**；岗位和简介可以留空。

![首次进入 Bot 模式的创建入口](/guides/install/05-bot-mode-zh.webp)

![填写教程助手名称的创建窗口](/guides/install/06-create-bot-zh.webp)

打开新 Bot 的 DM，点击顶部名称 / 头像 → **查看详细 → 模型预设**，选择 Orchestrator 与 Assignment 模型并点击 **创建并应用**。完整表单说明见 [API 与 Bot 模型](/zh/docs/model-setup)。返回 DM 后发送一句问候。收到回复才能确认模型也能正常使用。模型凭据在 DSH 中配置，npm 安装不会提供模型凭据。

![公开安装包冷启动后，在网页 DM 中收到真实模型回复](/guides/install/07-local-reply-zh.webp)

_本次验证从网页 DM 发送消息，在安装并冷启动后的产品中收到真实模型回复。聊天平台账号仍未连接。_

图标、并发上限、人格、提醒策略、侧栏与工作区授权等参数见 [设置指南](/zh/docs/settings)。

## 5. 连接聊天平台

首次安装没有已连接的 IM 账号。先确认本地 DM 正常，再按 [连接 Lark / 飞书](/zh/docs/lark-connection) 配置应用账号、绑定外部身份并授权群。安装插件不会自动授权外部群。

## Git

Bot 的记忆是一个 Git 仓库，所以运行 DSH 的电脑需要 Git 2.28 或更新版本。没有 Git 或版本太旧时，Bot 模式会在名册顶部提示，并在 Git 可用之前禁用创建和导入 Bot。

最快的办法是点提示里的 **安装 Git**。它会把一个便携版 Git（约 65 MB）下载到 DeepSeek Harness 的数据目录，用固定的校验值核对后立即启用。不需要管理员权限，也不会改动电脑上已有的 Git。DeepSeekBot 先从 `media.botharness.ai` 下载，失败时再从 GitHub 下载。可用的系统 Git 永远优先，所以之后你自己装了 Git，下次启动 DeepSeek Harness 就会改用它。

也可以自己安装 Git：

- **macOS**：在终端运行 `xcode-select --install` 并按提示安装，或用 Homebrew 安装（`brew install git`）。
- **Windows**：安装 [Git for Windows](https://git-scm.com/download/win)，选项保持默认即可。
- **Linux**：用发行版的包管理器安装 `git`，例如 `sudo apt install git`。Ubuntu 20.04 自带的是 Git 2.25，需要更新版本时可以用 [git-core PPA](https://launchpad.net/~git-core/+archive/ubuntu/ppa)。

自己装好后重启 DeepSeek Harness，在 Bot 模式里点 **重新检测**。

## 其他导入方式

[DSH 官方打包文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)也支持通过 CLI 安装到指定 Profile：

```bash
dsh plugin --profile <your-profile> add deepseekbot
```

使用你实际启动的 Profile 名称，之后在该 Profile 的插件页启用插件。

如果想导入同一份已编译安装包，可以运行 `npm pack deepseekbot` 下载公共 npm tarball，它会在当前目录保存 `deepseekbot-<version>.tgz`。在 Web 界面的「包名或地址」填写 **运行 DSH 的机器上的绝对路径**；另一台浏览器机器的路径不能替代 Host 路径。使用 CLI 时，也可以在下载目录运行 `dsh plugin --profile <your-profile> add ./deepseekbot-<version>.tgz`。

## 安装遇到问题

| 现象                         | 下一步检查                                                                |
| ---------------------------- | ------------------------------------------------------------------------- |
| 找不到包或版本               | 核对完整包名和版本，选择 npm 官方源，等待 registry 元数据可用后重试。     |
| 已安装，但没有 Bot 模式      | 在当前 Profile 启用 deepseekbot；按 DSH 的重启提示操作，再刷新 Web 页面。 |
| 有 Bot 模式，但 Bot 无法回复 | 核对选中的模型和 DSH 凭据；插件安装与模型权限分别验证。                   |
| IM 设置没有账号              | 按连接教程添加应用账号；首次安装的空账号列表是正常状态。                  |

需要从源码开发时，参考 [仓库 README](https://github.com/BotHarness/BotHarness#readme) 和 [本地开发指南](/zh/dev/guides/client-bridge)。
