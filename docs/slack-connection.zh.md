# 连接 Slack

将 PersonaBot 接入 Slack：配置应用、本机连接、把应用绑定到 Bot。绑定后，在应用所在的频道里 @ 它，消息会进入这个 Bot 的收件箱，Bot 在原 Slack 话题回复。不需要逐个授权频道。

## 先区分三个设置

| 设置        | 位置                                                 | 作用                                                                   |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| IM 应用连接 | 设置 → IM机器人 → Slack（总览：设置 → IM 应用）      | 让本机连接一个 Slack 应用机器人                                        |
| 外部身份    | Bot 私聊 → Channel sidebar → 外部身份 → **绑定应用** | 把应用绑定到这个 Bot，并管理它的会话：静音、规则、屏蔽、同步到 Channel |
| 外部连接器  | Bot 私聊 → Channel sidebar → 外部连接器              | 高级：修改 Channel 同步与保存的发送目标                                |

Bot 能在哪里发言由 Slack 决定：应用被邀请进了哪些频道、安装了哪些权限。绑定应用不会把外部消息镜像到本地 DM；一个应用只属于一个 Bot。

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

## 4. 把应用绑定到 PersonaBot

打开 PersonaBot 的私聊，在右侧 **Channel sidebar** 展开 **外部身份**，点击 **+ 绑定应用**，选择已连接的 Slack 应用并确认。身份行显示「已就绪」后，在应用所在的频道里 @ 它，消息会直接进入这个 Bot 的收件箱，Bot 在同一话题回复。详见[外部身份](/zh/docs/channel-sidebar/external-identities)。

![绑定身份对话框：选择已经认证的 IM 账号](/guides/slack/08-bind.webp)

_本节图片为旧版 Profile 布局；现在绑定位于右侧侧栏的「外部身份」。_

![真实 Slack 绑定身份：状态、启用开关、编辑与解绑](/guides/slack/09-identity.webp)

每个频道在第一条被接收的消息到达后出现在应用的会话列表里。**新会话** 决定它自动接收（默认），还是先放在 **等待处理** 由你允许。在会话行上用 **静音**、**规则**、**屏蔽** 让频道安静、调整接收或拒绝它；**再次允许** 解除屏蔽，但不会补发错过的消息。

## 5. 验证 @ 收件与原话题回复

在已授权 Slack 频道里，从提及选择器选中实际应用，发送：

> @你的应用 请通过 bridge_reply 在这个 Slack 话题只回复 SLACK-OK，不要发本地 DM。

打开 PersonaBot 侧边栏的 **Bot 收件箱**，或活动中心，找到新来源并打开详情。核对 Slack 频道、原始发送者、接收身份与正文。「已处理」表示 Bot 已处理此来源，还需要到 Slack 检查实际回复。

![真实已处理 Slack 来源：原始发送人、接收身份与关联报告](/guides/slack/10-source.webp)

_这是 #868 实测中，Human 对此前 Slack 报告的跟进消息。本地路径为 Inbox-only，因此不会创建本地 DM 消息。_

![真实 Slack 话题中的产品安装与重启验收回复](/guides/slack/11-native.webp)

_模型在原 Slack 话题回复了 BH868-PRODUCT-OK 与 BH868-RESTART-OK。验证自己的安装时，请使用自己的测试口令；这些截图是指定 QA 应用的证据。_

再发一条不带 @ 的普通消息。仅收 @、且未显式跟进话题时，这条消息不应进入该 Bot 的 Inbox。回复一次不会自动跟进此话题的全部消息。

## 6. 可选：把频道同步到本地频道

Slack 消息默认只进入 Bot 收件箱，不占用本地 DM 历史。要让某个 Slack 频道显示在本地时间线里，在应用会话列表中点击该行的 **同步**，在 **同步到 Channel** 中选择 Bot 私聊或这个 Bot 所在的 Group Channel，再点击 **开始同步**。共享频道中的每个成员 Bot 保持各自的 Attention／唤醒策略。

![真实共享频道外部连接器表单：复用已经授权的 Slack 群](/guides/slack/12-connector.webp)

_这张 #845 截图为早期的连接器表单。现在从会话行开始同步，之后可在 **外部连接器** 中修改、暂停或移除。_

暂停同步会停止新收件，保留配置与历史。移除同步不会删除旧消息。身份启停与同步启停分别管理。

### 普通消息、汇总与话题跟进

先从 @消息开始。要收普通文本，先开通 `channels:history` 与 `message.channels`、安装变更后的权限，再在频道发一条普通测试消息并刷新。BotHarness 需要观察到实际普通消息投递，才会提供全量收件或话题跟进。

在频道会话行打开 **规则**，只为需要的频道自定义 **全部消息**，选择数量／时间汇总（例如 5 条或 30 秒），或安全排队的逐条唤醒。共享频道中的每个 Bot，通过自己的 Attention 设置决定何时处理。收件、唤醒、是否回复分别判断。

Bot 可以显式跟进或退出一个原生 Slack 话题；Human 可在 **话题跟进** 查看、覆盖。跟进话题中的无 @ 回复可以进入，其他话题沿用各自规则。Bot 也可按需读取有界频道历史、附近上下文或话题，通过续页继续读取；这些历史不会被当作新消息灌入 Inbox。

**Bot 设置 → Slack 默认设置** 管理默认收件、汇总和身份启用行为。频道的 **规则** 可继承或显式覆盖。全局修改作用于仍继承的配置及后续事件，不会创建账号、接收新频道或重放旧历史。

Slack 可以直接发往频道，所以永远不需要保存发送目标。**外部连接器 → 保存发送目标（高级）** 只作为不支持直接发往会话的应用的后备。

## 排查问题

| 现象                   | 检查与处理                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 验证／连接失败         | 核对 `xoxb-…` 与 `xapp-…` 字段、App Token 的 `connections:write`、工作区安装与 Socket Mode；两种令牌应来自同一应用。 |
| 在线但没有来源         | 确认机器人已加入公共频道，订阅 `app_mention`，使用真正 @；核对应用已绑定到这个 Bot，频道没有在等待处理、静音或屏蔽。 |
| 无法选择全部消息       | 核对 `message.channels` 与已安装的 `channels:history`；发送新的普通文本后刷新，确认真实投递。                        |
| 上下文／文件读取被拒绝 | 检查已安装权限与当前成员资格；批准权限变更后重新安装。文件处理还需要授权 Workspace。                                 |
| 来源已处理却没有回复   | 查看来源／Outbox 状态与原生话题。Bot 可能选择不回复，或自身身份／授权已失效；结果不确定的发送不会盲目重试。          |
| 需要重连或重启         | 保留同一个 Profile，同一应用只运行一个收件实例；恢复后验证新消息。重连不自动补收缺失历史。                           |

本指南涵盖已验证的 **公共频道** @消息、普通文本、有界上下文、原生话题跟进、显式共享频道投递、带 @ 文件处理和显式报告。私有频道／Slack DM、无 @ 文件分享收件、编辑／删除同步、工作区全局搜索、断线历史补收与定时晨报服务不在本次资格验证范围。Slack 的已读标记不是 BotHarness 收件证据。平台边界与后续适配流程见 [IM 接入指南](/zh/dev/guides/im-provider-integration/)。
