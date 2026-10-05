# 连接 Slack

将 PersonaBot 接入一个 **Slack 公共频道**：配置应用、本机连接、绑定 Bot 身份，再授权频道。先使用 @应用机器人 的消息，确认 Bot 能在原 Slack 话题中回复。

## 先区分三个设置

| 设置        | 位置                      | 作用                                      |
| ----------- | ------------------------- | ----------------------------------------- |
| IM 应用连接 | 设置 → IM机器人 → Slack   | 让本机连接一个 Slack 应用机器人           |
| 外部身份    | PersonaBot 的详细 Profile | 决定这个 Bot 以谁的身份对外发言           |
| 频道连接器  | Channel 的详细 Profile    | 决定哪些外部消息进入本地频道或 Bot 收件箱 |

连接应用不等于授权所有 Slack 频道。绑定身份不会自动把外部消息镜像到本地 DM。每个 Bot 对外回复都使用自己的绑定身份与授权。

## 1. 准备环境

你需要一个允许安装应用的 Slack 工作区、创建应用的权限（或管理员协助），以及一个公共测试频道。在 BotHarness 中创建 PersonaBot，先确认它能回答本地 DM，再测试 Slack。

使用包含已验证 IM Provider 的 BotHarness 产品。不要额外安装任意版本的 dsh-im，也不要为同一应用启动第二个收件实例。

**本指南对应已验证的源码预览，不代表 npm 产品已经发布。** 实测产品为 `0.0.0-test.868`，Provider 为 `4.32.0-botharness.3`，DSH 为 `0.2.0-rc.1`。需要自行构建时，按[产品安装说明](https://github.com/BotHarness/BotHarness/blob/43ca0c58f88dafa212fc56b64c8665f33c1472a1/docs/product-im-installation.md)对应版本操作。启动器的登录链接只在本机使用；沿用同一个 Profile 保留设置。

截图来自真实界面与 DoodleBear 工作区的专用「BotHarness Slack QA」应用。空表单和已连接状态分别说明；运行时截图来自已验收的 #868 产品，共享频道截图来自 #845。图片不包含令牌，可以打开查看原尺寸。

## 2. 创建 Slack 应用

1. 在 BotHarness 打开 **设置 → IM机器人 → Slack → 开始接入**。
2. 点击 **复制 Manifest**，再点击 **打开 Slack 创建页**。在 [Your Apps](https://api.slack.com/apps) 选择 **Create New App → From a manifest**，选择工作区、粘贴配置，核对应用名称、权限与事件后创建。组织可能要求管理员批准。
3. 保留本机接入表单；安装应用后再填写两种令牌。

![本机 Slack 接入向导：复制 Manifest、创建链接与空白双 Token 字段](/guides/slack/01-onboarding.webp)

_空表单说明入口与凭据填写位置，不是连接成功的证明。_

![Slack 创建应用对话框中的 From a manifest 选项](/guides/slack/02-create.webp)

_选择 From a manifest。这张截图停在创建之前；请使用自己的工作区与应用名称。_

Manifest 是起始配置，不是凭据。连接前，按下面的说明核对后台设置。Slack 的 [Manifest 文档](https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/)介绍了配置的应用方式。

### Socket Mode 与 App Token

进入应用的 **Socket Mode** 页面并开启。BotHarness 通过向外建立的 WebSocket 接收事件，不需要公开 Request URL，也不需要 Incoming Webhook。

在 **Basic Information → App-Level Tokens** 生成带 **`connections:write`** 的 App Token。保管好 `xapp-…` 值，填写在本机的 **App Token** 字段，不是 Bot Token。参见 Slack 的 [Socket Mode 指南](https://docs.slack.dev/apis/events-api/using-socket-mode/)。

![真实 Slack 应用的 Enable Socket Mode 已开启](/guides/slack/03-socket.webp)

_这是现有 QA 应用的配置状态，页面不展示 App Token。_

### Bot 权限与事件

进入 **OAuth & Permissions → Bot Token Scopes**，按用途核对：

| Bot 权限                    | 用途                                            |
| --------------------------- | ----------------------------------------------- |
| `app_mentions:read`         | 接收频道里 @应用机器人 的消息                   |
| `chat:write`                | 以应用 Bot 身份发送与回复                       |
| `channels:read`             | 查看公共频道信息，供授权选择                    |
| `users:read`                | 将发送者 ID 关联到姓名                          |
| `channels:history`          | 读取已授权公共频道上下文；配合订阅接收普通文本  |
| `files:read`、`files:write` | 读取带 @ 的来源文件并回传处理后的附件；按需开通 |

截图是已经批准的 QA 应用，包含可选文件权限。只申请场景所需权限。增加权限后，需要安装或重新安装到工作区，已授予的令牌才能使用这些权限。

![Bot 提及与公共频道信息权限](/guides/slack/04-scopes.webp)

![其余 Bot 权限，包括文件与用户信息读取；未申请 Human 用户权限](/guides/slack/05-scopes-detail.webp)

_这里是 Bot 权限。Human 登录或 User Token 权限不能替代应用机器人的授权。_

在 **Event Subscriptions** 开启事件，将 **`app_mention`** 加到 **Subscribe to bot events**。需要普通公共频道文本或话题跟进时，再添加 **`message.channels`**，保存订阅。开启 Socket Mode 后不需要 Request URL。

![真实事件订阅包含 app_mention 与 message.channels](/guides/slack/06-events.webp)

_权限决定允许访问什么；事件订阅决定 Slack 实时推送什么。BotHarness 仍按已授权频道与收件策略筛选。参见官方 [app_mention](https://docs.slack.dev/reference/events/app_mention/) 与 [message.channels](https://docs.slack.dev/reference/events/message.channels/) 说明。_

## 3. 安装应用并在本机连接

1. 在 Slack 后台选择 **Install App → Install to Workspace**，或 **OAuth & Permissions → Install/Reinstall to 工作区**。核对权限并完成组织要求的管理员批准。
2. 在 **OAuth & Permissions** 获取 **Bot User OAuth Token**（`xoxb-…`）。这是 **Bot Token**，用于已安装机器人的 API 操作；与建立 Socket Mode 连接的 `xapp-…` App Token 不同。
3. 回到本机表单，分别填入对应字段，点击 **验证并连接**。凭据保存在本机凭据服务；不要贴到聊天、Memory 或 Git。
4. 确认 **设置 → IM机器人 → Slack** 显示应用在线。通过 Slack 频道的应用集成，或 `/invite @应用名`，把机器人加入公共测试频道。

![已验证产品中的 Slack 应用在线状态](/guides/slack/07-connected.webp)

_这是 #868 实际安装产品的连接结果，不是填满表单的模拟图。参见 Slack 的[安装说明](https://docs.slack.dev/authentication/installing-with-oauth/)。_

## 4. 绑定 PersonaBot 并授权频道

打开 PersonaBot 的 **详细 Profile → 外部身份**，点击 **绑定身份**，选择已连接的 Slack 应用账号并保存。一个 Bot 可以绑定多个平台，每个平台一个身份。

![绑定身份对话框：选择已经认证的 IM 账号](/guides/slack/08-bind.webp)

_这里只绑定身份，不会授权新频道或开启收件。_

![真实 Slack 绑定身份：状态、启用开关、编辑与解绑](/guides/slack/09-identity.webp)

随后展开 **频道连接器与授权**，从选择器中选择绑定账号与外部公共频道，完成授权。如果找不到频道，先核对应用安装、频道成员资格，再刷新。

![真实已授权 Slack 频道与独立话题策略管理](/guides/slack/13-authorized.webp)

_现有 QA 账号已绑定到此明确授权的频道。话题跟进单独管理。_

在 **频道连接器** 表中管理此来源的投递路径。初次测试保持 **仅收 @**，目标选择 **仅 Bot Inbox**。核对启用开关与运行状态；它们与身份的启用开关相互独立。

## 5. 验证 @ 收件与原话题回复

在已授权 Slack 频道里，从提及选择器选中实际应用，发送：

> @你的应用 请通过 bridge_reply 在这个 Slack 话题只回复 SLACK-OK，不要发本地 DM。

打开 PersonaBot 侧边栏的 **Bot 收件箱**，或活动中心，找到新来源并打开详情。核对 Slack 频道、原始发送者、接收身份与正文。「已处理」表示 Bot 已处理此来源，还需要到 Slack 检查实际回复。

![真实已处理 Slack 来源：原始发送人、接收身份与关联报告](/guides/slack/10-source.webp)

_这是 #868 实测中，Human 对此前 Slack 报告的跟进消息。本地路径为 Inbox-only，因此不会创建本地 DM 消息。_

![真实 Slack 话题中的产品安装与重启验收回复](/guides/slack/11-native.webp)

_模型在原 Slack 话题回复了 BH868-PRODUCT-OK 与 BH868-RESTART-OK。验证自己的安装时，请使用自己的测试口令；这些截图是指定 QA 应用的证据。_

再发一条不带 @ 的普通消息。仅收 @、且未显式跟进话题时，这条消息不应进入该 Bot 的 Inbox。回复一次不会自动跟进此话题的全部消息。

## 6. 选择消息进入哪里

| 目标                       | 效果                                                            |
| -------------------------- | --------------------------------------------------------------- |
| 仅 Bot Inbox               | 外部来源进入 Bot 收件箱，不占用本地 DM 历史                     |
| 显式本地 DM 或群组 Channel | 外部来源进入该频道历史；各成员 Bot 使用独立 Attention／唤醒策略 |

要接入共享频道，先把参与 Bot 加入本地 Channel，打开详细 Profile，点击 **添加频道连接器**。选择已经授权的 Slack 来源，设置易识别名称、接收条件后保存。弹窗会显示本地目标；此操作不会创建应用或扩大外部授权。

![真实共享频道连接器表单：复用已经授权的 Slack 群](/guides/slack/12-connector.webp)

_这张 #845 截图展示共享频道配置。本地讨论留在本地；Bot 对外回复时必须显式选择来源，并使用自己的授权身份。_

连接器开关暂停新收件，保留配置与历史。删除连接器不会删除旧消息。身份启停与连接器启停分别管理。

### 普通消息、汇总与话题跟进

先从 @消息开始。要收普通文本，先开通 `channels:history` 与 `message.channels`、安装变更后的权限，再在授权频道发一条普通测试消息并刷新。BotHarness 需要观察到实际普通消息投递，才会提供全量收件或话题跟进。

在 Profile 中只为需要的来源自定义 **全部消息**，选择数量／时间汇总（例如 5 条或 30 秒），或安全排队的逐条唤醒。共享频道中的每个 Bot，通过自己的 Attention 设置决定何时处理。收件、唤醒、是否回复分别判断。

Bot 可以在授权范围内显式跟进或退出一个原生 Slack 话题；Human 可在 **话题跟进** 查看、覆盖。跟进话题中的无 @ 回复可以进入，其他话题沿用各自规则。Bot 也可按需读取有界频道历史、附近上下文或话题，通过续页继续读取；这些历史不会被当作新消息灌入 Inbox。

**Bot 设置 → Slack 默认设置** 管理默认收件、汇总和身份启用行为。Profile 可继承或显式覆盖。全局修改作用于仍继承的配置及后续事件，不会创建账号、授权频道或重放旧历史。

## 排查问题

| 现象                   | 检查与处理                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 验证／连接失败         | 核对 `xoxb-…` 与 `xapp-…` 字段、App Token 的 `connections:write`、工作区安装与 Socket Mode；两种令牌应来自同一应用。 |
| 在线但没有来源         | 确认机器人已加入公共频道，订阅 `app_mention`，使用真正 @，并核对 Bot 绑定、频道授权与连接器启用。                    |
| 无法选择全部消息       | 核对 `message.channels` 与已安装的 `channels:history`；发送新的普通文本后刷新，确认真实投递。                        |
| 上下文／文件读取被拒绝 | 检查已安装权限与当前成员资格；批准权限变更后重新安装。文件处理还需要授权 Workspace。                                 |
| 来源已处理却没有回复   | 查看来源／Outbox 状态与原生话题。Bot 可能选择不回复，或自身身份／授权已失效；结果不确定的发送不会盲目重试。          |
| 需要重连或重启         | 保留同一个 Profile，同一应用只运行一个收件实例；恢复后验证新消息。重连不自动补收缺失历史。                           |

本指南涵盖已验证的 **公共频道** @消息、普通文本、有界上下文、原生话题跟进、显式共享频道投递、带 @ 文件处理和显式报告。私有频道／Slack DM、无 @ 文件分享收件、编辑／删除同步、工作区全局搜索、断线历史补收与定时晨报服务不在本次资格验证范围。Slack 的已读标记不是 BotHarness 收件证据。平台边界与后续适配流程见 [IM 接入指南](/zh/dev/guides/im-provider-integration/)。
