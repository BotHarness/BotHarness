# 连接 Lark / 飞书

先按 [图文安装教程](/zh/docs/installation) 安装插件，确认本地 Bot DM 正常后，再继续本页。

把一个 PersonaBot 接入工作群：先连接应用机器人，再绑定 Bot 身份并授权群，最后选择消息进入 Bot 收件箱还是本地频道。

本页以 **Lark 国际版、应用机器人、测试群、只收 @** 为起点。飞书用户使用同样的配置顺序，但要选择飞书平台、使用飞书开放平台创建的应用。

## 先分清三个设置

| 设置        | 在哪里                    | 决定什么                           |
| ----------- | ------------------------- | ---------------------------------- |
| IM 应用连接 | 设置 → IM机器人 → 飞书    | 本机连接哪个 Lark / 飞书应用机器人 |
| 外部身份    | PersonaBot 的详细 Profile | 这个 Bot 在外部以谁的身份发言      |
| 频道连接器  | Channel 的详细 Profile    | 哪个外部群、哪些消息进入这个频道   |

**绑定身份后，还要明确授权群**。绑定身份不会自动接收所有群消息；添加频道连接器也不会给其他 Bot 借用这个身份。

本页结合真实界面入口与已完成 Lark 连接的测试 Profile。已连接截图来自 #823 验证的产品产物（`0.0.0-test.823.6` / Provider `4.32.0-botharness.2`）；测试群为「BotHarness IM QA #78」。空表单截图用于说明填写位置，不代表已完成连接。App Secret 不出现在媒体中。右键（手机长按）截图，可查看原图。

## 1. 准备可用环境

你需要：

- 已加入 Lark / 飞书组织，并有创建、发布企业自建应用的权限，或能请组织管理员协助。
- 一个用于验证的群，以及一个能在该群发送消息的 Human 账号。
- 已运行的 BotHarness、可用模型和一个 PersonaBot。先在本地 DM 中确认 Bot 能正常回复。
- 包含已验证 IM Provider 的 BotHarness 产品。产品把 Core、Client 与 Provider 一起安装；**不用另外安装 Lark SDK、Human lark-cli 或任意版本的 dsh-im**。

**公开 npm 产品尚未发布。** 当前可复现路径是构建本地产品包；不要把下面的测试版本当成 npm 安装命令。已有 #823 验证产物的用户直接启动同一 Profile，然后进入下一节。

<details>
<summary>当前源码预览：构建已验证的单次安装产品</summary>

使用 Node ≥22 与 pnpm 12.4.2。在新的目录中固定已验证版本，不在正在运行的 checkout 上切换分支：

```bash
git clone https://github.com/BotHarness/BotHarness.git botharness-lark
cd botharness-lark
git checkout c2a1f7cba13d1ba82e1b9e9b3b923babe428c0e7
git clone https://github.com/DoodleBears/dsh-im.git /tmp/bh-lark-provider
git -C /tmp/bh-lark-provider checkout 48e7a35792af5222cd40cfe1ba2607ac55a59df2
npm ci --prefix /tmp/bh-lark-provider --ignore-scripts --no-audit --no-fund
pnpm install --frozen-lockfile
pnpm build
node scripts/product-artifacts.mjs \
  --provider-source /tmp/bh-lark-provider \
  --output /tmp/bh-lark-product \
  --version 0.0.0-test.lark-guide
node scripts/dev-instance.mjs \
  --home "$HOME/.local/share/botharness-lark" \
  --port 32620 --product-artifacts /tmp/bh-lark-product
```

</details>

启动器输出的登录 URL 只在本机打开，不放进截图或视频。下次使用同一个 `--home`，保留账号、授权和消息记录；同一个应用只由一个 Host 接收事件。完整打包背景见 [产品安装说明](https://github.com/BotHarness/BotHarness/blob/c2a1f7cba13d1ba82e1b9e9b3b923babe428c0e7/docs/product-im-installation.md)。

## 操作视频：连接、授权、确认消息

以下是**真实界面截图的分步剪辑**，不是连续录屏或模拟连接成功。可暂停、拖动进度或打开中英文字幕；首次播放才下载视频。

<video controls preload="none" playsInline poster="/guides/lark/06-connected.webp" style={{width: '100%', maxHeight: '640px'}}>
<source src="/guides/lark/lark-setup-walkthrough.mp4" type="video/mp4" />
  <track kind="captions" src="/guides/lark/lark-setup.zh.vtt" srcLang="zh" label="中文" default />
  <track kind="captions" src="/guides/lark/lark-setup.en.vtt" srcLang="en" label="English" />
</video>

[下载视频](/guides/lark/lark-setup-walkthrough.mp4) · [中文字幕](/guides/lark/lark-setup.zh.vtt) · [English captions](/guides/lark/lark-setup.en.vtt)

观看顺序：0:00 应用凭据与权限 → 0:32 本机连接 → 0:48 事件订阅与发布 → 1:12 投递目标 → 1:20 身份与群授权 → 1:36 消息来源。下文保留可逐项执行的步骤。

## 2. 在开放平台准备应用机器人

Lark 打开 [Lark 开发者后台](https://open.larksuite.com/app)；飞书打开 [飞书开发者后台](https://open.feishu.cn/app)。账号、组织和应用必须属于同一个平台。

1. 创建**企业自建应用**，给它取一个容易认出的名字，例如「团队助手」。群里的自定义 Webhook 机器人只适合通知，不是本页的双向应用机器人。
2. 添加**机器人能力**，在「凭证与基础信息」找到 App ID 和 App Secret。
3. 为**应用身份**配置消息权限。Human 扫码登录的用户权限不能代替应用权限。
4. 在事件配置中使用**长连接**，订阅 `im.message.receive_v1`（接收消息事件）。如果后台要求先建立长连接，先完成下一节的本机连接，再回来保存订阅。
5. 创建并发布应用版本；按组织要求完成管理员审批和可用范围配置。把应用机器人加入测试群。

权限按用途开通：

- `im:message.group_at_msg:readonly`：接收群里 @机器人的消息；首次群收件验证需要。
- `im:message:send_as_bot`：以应用机器人身份发送、回复；首次回复验证需要。
- `im:message:readonly`：读取消息与消息资源；主动读取原消息、附件等能力需要。
- `im:message.group_msg`：获取群组中所有消息；普通消息收件、群历史与话题跟进需要。这是敏感权限，按需要开通。
- `im:resource`：上传图片、文件等资源；需要发送附件时开通。

权限是否可申请、是否需要审批，以你的组织后台为准。开通全群消息权限后，BotHarness 仍按明确授权的群和收件条件处理，不会自动把所有消息放进 Inbox。接口细节可参考 [接收消息事件](https://open.larksuite.com/document/server-docs/im-v1/message/events/receive) 和 [获取历史消息](https://open.larksuite.com/document/server-docs/im-v1/message/get-2)。

### 对照真实后台配置

![新创建的引导测试应用，仅加入三项初始应用身份权限](/guides/lark/18-new-app-minimum-scopes.webp)

_这个新应用是在 Lark 后台实际创建的 #824 引导测试应用。三项权限的 Type 均为 Tenant token，状态为 Added。顶部仍显示 Pending release：加入权限不等于已生效。先建立本机连接、保存接收消息的事件订阅，再发布版本，之后才能验证群收件。此例没有开启全群消息权限。_

以下旧版参考截图来自已发布的测试应用，本轮只读核对配置。新应用仍需自己完成添加能力、申请权限、发布和管理员审批。不要照搬测试应用的全部权限或事件。

![真实后台的凭证入口，App Secret 保持隐藏](/guides/lark/09-credentials.webp)

_进入 Credentials & Basic Info 找到凭据；复制密钥到本机表单，不要点击展示密钥后截图。_

![已添加机器人能力的应用](/guides/lark/10-bot-capability.webp)

_在 Add Features 添加 Bot；添加后出现左侧 Bot 设置页。_

![筛选应用身份的消息权限](/guides/lark/11-message-permissions.webp)

_进入 Permissions & Scopes，搜索权限名，Type 选 Tenant token scopes。`im:message.group_msg` 是敏感权限，只有需要普通消息、群历史或话题跟进时才申请；图中的置顶、表情等权限不是本页要求。_

![以应用身份发送消息的权限](/guides/lark/12-send-permission.webp)

_搜索 `im:message:send_as_bot`，确认 Type 为 Tenant token、状态为 Added；还要发布变更才会生效。_

![真实事件配置使用长连接](/guides/lark/13-long-connection.webp)

_进入 Events & Callbacks → Event Configuration，Subscription mode 选择 persistent connection。连接由产品内的 Provider 建立，不用另开一个 SDK 接收进程。_

![已订阅接收消息事件](/guides/lark/14-message-event.webp)

_在 Events added 中核对 `im.message.receive_v1` 与 Tenant token。首次收件不需要图中的已读、表情、会议事件；本页不使用它们。_

![应用版本已经发布](/guides/lark/15-published.webp)

_进入 Version Management & Release 创建并发布版本，按组织要求完成审批；Released 和顶部已发布提示是本例的成功状态。_

## 3. 在本机连接应用

1. 打开左下角 **设置 → IM机器人 → 飞书**。
2. 打开 **手动接入**；应用平台选择 **Lark（国际版）**。飞书应用选择飞书，不能混用凭据。
3. 私下填入 App ID 和 App Secret，点击 **绑定并连接**。
4. 确认账号显示已连接；如果刚补了事件订阅或应用权限，回后台发布后再确认连接。

![IM机器人设置中的 Lark 手动接入表单，凭据为空](/guides/lark/01-provider.webp)

_图 1：Lark 应用选择国际版。密钥只输入本机设置，不粘贴到聊天、Git 或公开截图。界面的飞书扫码接入与 Lark CLI 的 Human 登录是不同流程；本页使用应用凭据接入。_

![实际测试应用显示「运行正常」；这是已连接状态，不是空配置示意](/guides/lark/06-connected.webp)

_图 1b：真实账号的绿色「运行正常」 只证明传输在线；还要绑定 PersonaBot、授权群，并核对消息来源与回复。_

接着为该账号配置一个**投递目标**：

1. 打开已连接机器人的设置，找到 **投递目标 → 新建目标**。
2. 从 **从已聊过的会话选择** 中选测试群，检查显示名称和群 Chat ID；或手动填写平台提供的原生群 ID（`oc_…`），不要填群名称或消息 ID。
3. 填一个调用别名，例如 `lark-test-group`，点击 **测试**，到 Lark 群确认测试消息，再点击 **保存目标**。

全新应用可能没有会话候选。#824 实测中，绑定 PersonaBot 前的预备 @消息没有立即填充列表，且进入了 Provider 自己的独立会话路径。建议手动填入已核实的原生群 Chat ID，再测试、保存；不知道 ID 时请向群管理员核实。独立会话的回复或发现目标的消息，都不是 BotHarness 的 canonical 收件证据。

![真实账号的已保存群投递目标](/guides/lark/16-delivery-target.webp)

_账号设置 → 投递设置 → 投递目标。这里的测试、保存目标只确认发送目的地；下一节还需给 PersonaBot 绑定身份并授权。_

## 4. 绑定 PersonaBot 身份并授权群

在 **Bot 模式**打开目标 Bot 的 DM，点击顶部 Bot 名称，再点 **查看详细**，进入详细 Profile。 点击 **配置引导**，选择应用平台、IM账号和保存的指定群目标。每个群独立核对；其他群的成功不能替代本群验收。步骤的「定位现有控件」打开或高亮实际设置，完成状态由实际配置和关联收件／回复决定。

![身份与群授权的操作示意：先绑定身份，再授权具体群，最后可选添加频道连接器](/guides/lark/05-identity-routing-annotated.webp)

_操作示意：①绑定身份 → ②授权具体群 → ③可选接入频道。这是基于截图的 AI 辅助合成标注图，演示账号尚未连接；下方保留原始界面截图供对照。_

1. 找到 **外部身份 → 绑定身份**，在 **IM账号**中选择刚连接的应用机器人，保存。
2. 展开 **频道连接器与授权**，选择该 IM账号和刚保存的**发送目标**。
3. 点击 **绑定并授权此目标**。核对群名称、账号和本地收件位置。
4. 初次验证保留 **仅此 Bot 的 Inbox**、**只收 @**。不用额外创建本地群，也不会占用 Bot DM 的消息历史。

![PersonaBot Profile 的绑定身份弹窗，IM账号尚未配置](/guides/lark/02-identity.webp)

_图 2：外部身份属于 PersonaBot。列表为空时，先检查上一步的应用连接、Provider 版本和保存目标。Human 扫码登录不等于绑定 Bot 身份。_

![PersonaBot Profile 中外部身份与频道连接器授权的准备状态](/guides/lark/03-authorize.webp)

_图 3：先绑定身份，再在「频道连接器与授权」中授权具体群。示例尚未连接账号，所以授权控件尚不可用。_

![已绑定真实 Lark 身份与测试群，保留 Inbox-only 与只收 @](/guides/lark/07-granted.webp)

_图 3b：真实测试群已绑定并授权，群接收已连接；普通消息收件仍未开启。截图中“继承全局默认”与“只收 @”是不同的配置字段。_

每个 Bot 可以绑定多个平台，每个平台绑定一个身份。同一个 Bot 在不同本地群中仍使用自己的外部身份。共享频道的其他 Bot 如需对外回复，也要绑定自己的身份并获得目标群授权。

## 5. 可选：把消息显示在本地频道

只想在 Lark 聊天、让消息进入 Bot Inbox，可以跳过这一节。如果希望团队在本地共同看到外部消息，打开已有 Group Channel 的详细 Profile；先把负责接收的 Bot 加为成员。也可以把来源接入 Bot DM 的消息历史。

在 **频道连接器 → 添加频道连接器** 中：

1. 选择**已授权的 Lark 群**。这里不创建外部账号或新增群授权；列表为空就返回上一节。
2. 确认**投递目标**：共享群频道、DM 消息历史，或仅 Bot Inbox。可选项取决于当前 Channel。
3. 填入容易辨认的**连接器名称**，例如「Lark 团队工作群」。
4. 保留**继承全局默认**，或明确选择**仅收 @接收身份**；开启接收并保存。

![添加频道连接器弹窗，展示来源、投递目标、名称和接收条件](/guides/lark/04-connector.webp)

_图 4：来源、投递位置和接收条件分别选择。演示账号尚未授权群，所以保存按钮不可用；真实配置完成后才可保存。_

一个频道可接入多个来源，同一外部来源也可接入多个目标。**连接器决定收什么，每个成员 Bot 的 Attention / 唤醒策略决定何时处理**。外部消息会以来源名称显示在消息气泡上方，点击来源打开详情；在本地普通回复不会自动广播回 Lark。

首次跑通后再调整高级行为：

- 全局默认在 **设置 → Bot 设置**中管理；Profile 可继承或覆盖，只影响后续消息，不补收历史。
- 要接收不带 @ 的普通消息，先发布相应应用权限和事件订阅，在已授权测试群发送一条无 @ 消息，再刷新验证结果。尚未验证真实普通消息投递时，全量收件选项不可用。
- 在群的收件与唤醒设置中选择按条数 / 时间汇总或逐条唤醒。进入 Inbox 不代表必须立刻回复，Bot 可以判断是否参与。
- Bot 要继续接收某个话题的无 @ 回复，需要显式跟进话题；回复一次不会自动跟进。平台必须实际把这些事件投递给应用。
- 暂停连接器的 Switch 保留配置与历史；删除连接器不删除已收消息。解绑身份是独立操作，会影响该 Bot 依赖此身份的外部行为。

## 6. 确认真的跑通

先做一个小测试：在授权的 Lark 群 **@应用机器人**发送「请在这里回复 LARK-OK」，不要同时测试多个 Bot 或多条路由。

成功应能逐项确认：

1. Bot DM 右侧的 **Bot 收件箱**出现该消息，来源是正确的 Lark 群，带原始发送人与消息内容。
2. 点开来源详情，能看到外部消息 ID、Source Event ID，以及存在时的话题信息。
3. Lark 原会话收到这个 Bot 以自己的应用身份发出的 `LARK-OK`。若在话题内测试，回复仍在原话题。
4. 默认只收 @ 时，再发送一条不带 @ 的普通消息，确认它不会作为新的普通收件触发该 Bot。已显式跟进的话题按话题策略处理。

![真实 Lark 话题消息的来源详情，显示外部会话和接收身份](/guides/lark/08-source.webp)

_图 5：这是已收件的真实话题消息。Source Event ID 是 BotHarness 的来源定位符；外部 message / thread / root / parent ID 由 Lark 提供，不能用本地 Channel ID 替代。_

在 Bot DM 右侧展开 **Bot 收件箱 → 群名**；若消息已处理，再展开「已处理或忽略」。点击消息打开 Modal，然后展开「来源详情」和「消息详情」。发送人名字无法解析时会显示平台 ID。

**不要以 Lark 消息旁的绿色 / 灰色已读圆圈判断 Bot 是否收件**。以本地 Inbox 来源记录和实际外部回复为准。

## 7. 在 Lark 私聊申请管理员配对

本次预览需使用 [#1027](https://github.com/BotHarness/BotHarness/issues/1027) 的 `codex/1027-lark-pairing` 版本，构建后通过 `scripts/dev-instance.mjs --im-provider` 启动隔离 Profile。上面的旧 #823 固定版本不含配对功能；不要让生产 Host 与预览实例同时接收同一应用。

当前源码预览先交付 **配对**，为后续 IM 管理建立授权前提。在 Lark 中提交审批决定、回答原生正式提问会由后续功能交付；本页能力选项记录审核通过的人将来可以执行哪些操作。配对不会改变普通聊天的收件配置。

1. 连接并绑定目标 Bot 的 Lark 身份。私聊需要开通 `im:message.p2p_msg:readonly`、订阅 `im.message.receive_v1` 并发布应用版本；只有 `im:message:readonly` 不能开启私聊事件。保留 `im:message:send_as_bot` 用于发送申请回执。
2. 打开 **Bot 模式 → Bot 名称 → 查看详细 → IM 管理员配对**，确认显示 **配对接收已就绪**。应用账号在线不等于配对接收就绪；同一应用只由一个 Host 接收。
3. 在应用机器人的 **私聊**里发送纯文本 `/pair`，不用输入 API Token 或复制用户 ID。申请人来自 Lark 提供的真实发送人；群里的命令不能授予管理权限。
4. 在已登录的 Web 页面点击 **刷新申请**，核对接收账号、申请人与申请编号。需要时展开缩略的申请人 ID 查看完整平台标识；平台未提供名字时，页面会明确说明，不编造姓名。
5. 在 10 分钟内明确勾选能力，点击 **批准所选能力**，或 **拒绝申请**。默认不勾选任何能力；第一个申请人也不会自动成为管理员。申请编号只用于定位申请，不能作为凭据兑换权限。
6. 点击 **撤销权限**可立即取消授权，重启不会恢复。之后再发 `/pair` 会产生需要重新审核的新申请。暂停身份或 Bot 时，已有授权暂不可用；Web 仍可撤销这项授权。

审核通过的授权在 Host 重启后保留，范围仅限 **当前 Bot**，不包含其他 Bot、审批人管理、VPS、DSH API 或工作区权限。10 分钟过期时间针对待审申请，已批准授权不受这个计时器影响。普通聊天接收与管理授权分别配置。

审核或刷新失败时，配对区域会在控件旁显示错误提示。请刷新并重新核对当前申请，再决定是否重试；错误不会授予权限。

### #1027：真实配对操作记录

以下截图来自真实 Lark 私聊和源码预览的已登录 Web 操作，使用 DSH `0.2.0-rc.1` 与兼容的固定 Provider。在明确授权的短暂停机窗口中，本机隔离测试 Host 独占现有应用；验证后已恢复生产 Host 及两个 IM 连接。完整申请人 ID 保持折叠。

**刷新并核对申请。** 第一条真实申请没有默认勾选的能力，**批准所选能力**按钮禁用。接收账号已就绪；Lark 未提供申请人的显示名称，页面明确说明。

![真实 Lark 申请等待 Web 审核，默认没有能力](/guides/lark/pairing/after-pending-light.jpg)

**只选择需要授予的能力。** 本例只勾选 **回答正式提问**。Web 批准后显示 **已授权**、这项能力与 **撤销权限**按钮。能力选项记录授权范围；当前配对预览还没有交付从 IM 回答正式提问的交互控件。

![通过真实 Web 操作只授予回答能力](/guides/lark/pairing/after-approved-light.jpg)

[查看同一已授权记录的深色截图](/guides/lark/pairing/after-approved-dark.jpg)。

**重启同一 Host 核对持久化。** 真实冷启动后仍保留原授权记录，能力仍只有 `answer`，接收器自动恢复就绪；没有重新创建或批准申请。

![真实 Host 重启后保留原授权](/guides/lark/pairing/after-restart-approved-dark.jpg)

**再次申请前先撤销。** 点击 **撤销权限**后，真实记录变为 **已撤销**，能力清空，撤销按钮消失。

![通过已登录 Web 撤销真实授权](/guides/lark/pairing/after-revoked-dark.jpg)

**在同一个 Lark 私聊重新发送 `/pair`。** 新申请的编号不同，没有继承权限，批准按钮仍禁用；旧记录保持已撤销。需要再次授权时必须重新审核。本次演示没有批准新申请；这些配对命令在 Operational Database 中没有产生普通 IM Source Event 或 Inbox Admission。

![撤销后真实重新申请，没有继承权限](/guides/lark/pairing/after-repair-dark.jpg)

[查看恢复服务时的浅色截图](/guides/lark/pairing/after-repair-light.jpg)：自动测试窗口结束后，本机 Web 显示连接中断提示和最后观察到的申请状态；这张截图不能证明接收器仍在线。

**验证结束后拒绝新申请。** 恢复生产服务后，本机继续关闭接收器；在已登录 Web 点击 **拒绝申请**，新记录变为 **已拒绝**。旧授权保持撤销，所有测试记录的能力均为空，没有遗留已授权或待审记录。

![关闭本机接收后通过 Web 拒绝剩余测试申请](/guides/lark/pairing/after-rejected-dark.jpg)

**审核窗口过期时**，批准控件消失。下面这条较早的真实申请未获批准便过期；截图时为让生产 Host 独占接收同一应用，本机接收器有意离线。

![已登录 Web Profile 中的真实 Lark 过期配对申请](/guides/lark/pairing/after-expired-light.jpg)

[查看同一过期状态的深色截图](/guides/lark/pairing/after-expired-dark.jpg)。

看不到申请时，检查私聊权限、应用发布、事件订阅、身份和配对接收状态。重新连接身份会重试接收器配置。此处使用的固定 Provider 会由后台监督器自动重连，单次断开应用不能保持测试独占。真实 QA 应使用专用测试应用，或在明确授权的服务停机窗口中完成，随后恢复生产 Host；不要让两个 Host 争用同一应用。

### 配对刷新失败后的恢复

这组补充截图来自合并最新主分支代码后的源码预览，使用全新隔离 Profile，没有连接外部 IM 应用。只停止该本机 Host，制造真实连接失败：点击 **刷新申请** 后，错误显示在配对控件旁，频道连接器与授权仍保持折叠。重启同一本机 Host，再次刷新后错误消失。这验证 Web 失败与恢复，和上面的真实 Lark 申请演示分别留档。

![浅色界面中配对刷新错误显示在控件旁](/guides/lark/pairing/integrated-failed-refresh-light.jpg)

[查看深色失败截图](/guides/lark/pairing/integrated-failed-refresh-dark.jpg)。

![重启隔离 Host 后配对刷新恢复的浅色界面](/guides/lark/pairing/integrated-recovered-light.jpg)

[查看深色恢复截图](/guides/lark/pairing/integrated-recovered-dark.jpg)。

## 常见问题

| 现象                          | 优先检查                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 应用找不到、连接失败          | Lark / 飞书平台选项、组织、App ID / Secret、Host 是否运行                                                     |
| 有连接但没有 IM账号可选       | 是否使用兼容的固定 Provider、账号是否在线、目标是否已经测试并保存；刷新 Profile                               |
| 群不在已授权列表              | Bot 是否已绑定身份；是否保存了投递目标并在该 Bot Profile 明确授权；共享频道是否包含该 Bot                     |
| @消息不进 Inbox               | 机器人是否在群；应用身份权限、`im.message.receive_v1` 长连接订阅、版本发布与管理员审批；本地授权和收件 Switch |
| 普通消息或话题无 @ 回复不进来 | `im:message.group_msg`、真实事件投递验证、群的接收条件；话题是否被显式跟进                                    |
| 历史读取返回 230027           | 应用身份的群消息读取权限及发布是否生效；Human 登录权限不能代替它                                              |
| 能收到，但不会回复            | 模型是否可用、Inbox / 唤醒状态；该 Bot 是否有自己的启用身份和该目标的发送授权                                 |
| 本地 DM 没有消息              | 检查是否选了 Inbox-only；这是有效的独立投递路径，不是丢消息                                                   |

如果需要协助，提供平台、操作步骤、可公开的错误码和已经完成的检查。不要附 App Secret、访问令牌或群中无关的消息内容。

## #824：真实新应用操作记录

以下是新应用的真实压缩截图，不是模拟成功。应用通过真实后台发布为 1.0.0，只加入指定 QA 群；本机连接、目标测试和保存、PersonaBot 身份绑定与指定群授权都通过产品界面完成。首次实测产物为一次安装的 `0.0.0-test.824.6`，新增指定群选择后的最终复验为 `0.0.0-test.824.7`（Provider `4.32.0-botharness.2`），没有另装接收进程。上文旧 #823 图与视频保留为参考，不替代本次新应用实测。

![新应用已连接](/guides/lark/19-new-app-connected.webp)

_连接正常仅确认 Provider 在线，尚不代表 Inbox 已收件。_

![新应用事件订阅已保存](/guides/lark/20-new-app-events.webp)

_长连接验证失败时先建立本机连接，再保存 im.message.receive_v1。_

![新应用版本已发布](/guides/lark/21-new-app-released.webp)

_发布、审批和可用范围与本机连接是不同状态。_

![新应用目标已测试保存](/guides/lark/22-new-app-target.webp)

_测试消息到达指定群后，保存投递目标。_

![账号目标身份与授权已确认](/guides/lark/23-new-app-guide.webp)

_前四步来自真实配置；点击引导不会推进完成状态。_

![原生话题中的提及和新应用自己的回复](/guides/lark/24-new-app-topic-reply.webp)

_无 @根消息未入库；两条指定 @消息进入该 Bot Inbox，LARK-SETUP-OK 在同一话题以新应用身份出现。截图裁掉无关会话；平台已读圆圈不是 canonical 收件证据。_

![真实引导中的来源关联收件与回复](/guides/lark/25-new-app-receipt.webp)

_原文 [BH-LARK-SETUP] 的 Source Event 末尾为 f708a3f1，对应 Inbox 已处理、关联回复为平台已接受。未观测到自身回传，引导要求 Human 到原话题核对。_

![临时连接与本机凭据已移除](/guides/lark/26-new-app-cleaned.webp)

_关闭重开和重启同一 Profile 后配置历史保留；重新加载后选择原账号核对。停用、撤销授权、解绑与移除账号使相应步骤重新待确认。验收后用原生移除接入停止接收并删除本机配置及凭据；外部应用保留，后台凭据重置仍由管理员操作。_

## 在管理私聊处理工具审批

此切片经受资格验证的 Provider 支持 Lark 私聊「允许一次／拒绝」卡片。原生提问表单使用下文独立的「回答」能力。群审批、保存自动规则和释放原生等待由后续切片实现；dsh-im 已发布版本号本身不能证明卡片能力，能力不可用时不会回退放行。

1. 在应用的「事件与回调 → 回调配置」选择长连接，添加 `card.action.trigger` 并发布版本。保留原有读消息／发消息权限，增加 `im:chat:read` 以在发送前验证确为私聊。这些应用变更须经维护者授权。
2. 在 Bot 的 Lark 私聊发送 `/pair`；认证 Web Profile 核对真实申请人和应用账号，明确授予「批准」及／或「拒绝」。配对不会建立普通私聊收件，也不授予 VPS／API 权限。
3. 在「Lark 管理通知」按姓名和接收账号选择管理私聊，点击「保存目的地」，再「发送测试卡片」。测试卡片没有审批按钮，不批准任何操作。
4. 后续原生工具审批会将完整操作发到该管理私聊，提供「允许一次／拒绝」。决定前核对操作；内容截断时到 Web 查看完整内容。点击后的提示仅说明操作已收到，正式决定和执行结果分开确认。
5. 在 Profile 刷新通知，点击「查看原生会话与完整操作」检查原生结果。「已批准」不代表工具已执行。拒绝、撤权、过期、重复或身份不匹配的操作均不能批准新调用。

![管理私聊尚未配对时的真实隔离实例](/guides/lark/approvals/settings-empty-dark.jpg)

图中是实际运行的私聊通知入口，尚无配对目的地；它不是 Lark 真实投递或执行成功的证据。本切片的外部资格验证另见 issue 的留档及 Human QA。

「结果未知」时先检查私聊，不自动重发。确定未发送的失败最多尝试三次。卡片更新也可能未确认，正式结果以 Web 原生会话为准。撤销配对或更改目的地使旧按钮失效；Host 重启使旧审批卡片过期，不从通知记录恢复工具调用。当前切片仍会等待原生审批；后续 Inbox 续接切片负责不阻碍其他消息。

Computer／Browser 的首次授权覆盖原生会话，因此通知不提供审批按钮，须到 Web 审核，不能通过 IM 的「允许一次」授予。

![已审核的测试私聊收到原生工具审批通知](/guides/lark/approvals/route-sent-dark.jpg)

2026-10-07 较早的隔离测试中，真实 Lark 平台接受了测试卡片和原生工具审批卡片。这张历史截图记录的是**投递已接受、决定仍待处理**，不展示 IM 决定或工具执行。之后获准的原生 Windows 窗口核验了 BotHarness 源码 `8936777b` 与 checked Provider 源码 `1422b07f`：Human 在 Lark 点击「允许一次」，原生 Node 打印调用准确执行一次并成功；另一张卡片点击「拒绝」，返回原生拒绝错误，没有替代调用。Human 确认两张最终卡片分别显示「已执行」和「已拒绝」。先关闭路由、撤销 QA 配对、解绑身份并停止本机接收，再在十分钟上限内恢复生产。Human 随后确认生产 Lark 与 Discord 均可正常回复。准确源码的证据与恢复检查见 [#1029](https://github.com/BotHarness/BotHarness/issues/1029)；此核验不会修改已发布 Provider 的锁定版本或部署功能。

![真实恢复状态：自动通知已关闭，旧请求已失效](/guides/lark/approvals/recovery-dark.jpg)

[查看浅色恢复截图](/guides/lark/approvals/recovery-light.jpg)。测试授权撤销后，本机 Host 在禁用 IM Provider 的状态下重启：目的地为「关闭自动通知」，旧请求「已失效」，本机身份暂不可用。这张截图不证明生产连接状态；恢复后的生产 Discord／Lark 连接已另行核验。新测试不能使用旧卡片。

## 在管理私聊回答原生提问

#1031 候选增加独立的受检查提问卡片契约。仅通过审批卡验证的 Provider 不能宣称支持提问；此候选不更新已发布 Provider 固定版本，也不启用第二个接收器。

1. 在 Bot 的 Lark 私聊发送 `/pair`，并在认证 Web 显式授予「回答」能力。「批准／拒绝」与「回答」互相独立。在「Lark 管理通知」选择此配对；普通聊天接收仍另行配置。
2. Bot 原来的 Orchestrator 发起原生 Human 提问后，已提交的问题同时出现在 Web 和所选私聊。为每个问题选择提供的选项或填写自己的答案，再点击「提交答案」。Lark 表单的每个输入框最多支持 1000 字。单选问题填写自定义答案前须清空已有选项；多选问题可同时提交选项与自定义答案。
3. 单个问题也可用纯文本回复原卡片，或发送 `/answer <12 位编号> <答案>`。没有准确编号或原卡片引用时，普通澄清仍留在普通聊天。多个待答请求、包含多个问题的请求、格式错误或编号与引用矛盾时，必须明确选择，系统不会猜测。
4. 点击确认只表示已排队，不代表已回答。原生提问服务在提交时复查实际用户、回答能力、当前账号／路由、原回执、选项值及实时 Session。Web 和 Lark 只能提交一次权威答案；答案文字不会产生工具批准或自动规则。
5. 「Lark 提问通知」分开显示原生状态、卡片发送与答案提交。「核对原提问」使用同一实时提问者和既有权威记录核对未知结果，不重放答案。失败仍保留原提问，可在 Web 回答。未知卡片发送不重发；确定未发送或更新失败时可显式修复，发送最多三次。

取消原生提问后，受检查路由仍可用时会更新原卡片。重启使仍等待的原生提问者失效并拒绝旧控件，不从通知行恢复 Promise。卡片更新失败不改变权威答案，请核对 Web 和原生 Session。此切片仍使用原生等待，不宣称释放 Inbox 继续处理。

验证按准确源版本记录：原生提问者／受检查 Provider 回归及原生 Windows Web／模型运行属于本地证据。Lark 表单、真实 SDK 回调和最终卡片仍须新的独占接收窗口与真人操作；已完成的 #1029 审批窗口不能证明 #1031 提问。批准新窗口前，生产 Lark 和 Discord 保持已恢复的接收器。

首次获准的 #1031 平台窗口核对了新配对并仅授予「回答」，随后 Lark 在创建卡片前返回 `11310`：原 2000 字输入设置超过平台最多 1000 字的限制。未接受任何答案，也未重放未知投递；先撤销 QA 权限、解绑身份并停止接收器，再于十分钟内恢复生产。候选已将表单渲染及输入校验收窄至 1000 字；实际表单提交与最终卡片仍待新窗口核验。

![真实原生 Profile 分开显示提问通知，接收保持禁用](/guides/lark/questions/after-light.png)

[深色主题](/guides/lark/questions/after-dark.png)。配对的[浅色基线](/guides/lark/questions/before-light.png)和[深色基线](/guides/lark/questions/before-dark.png)使用已合并 #1029 源码、相同 QA Bot 名称、语言及 1440 × 960 视口。两个 Profile 均没有管理路由或 IM 绑定；候选侧栏中的旧 QA 条目是历史记录。这些本机设置截图不证明 Lark 投递。

![Windows Web 运行中，原来的原生提问者接受选项与自定义文字](/guides/lark/questions/native-question-answered-light.png)

[等待回答的原生提问](/guides/lark/questions/native-question-pending-light.png) · [深色已回答状态](/guides/lark/questions/native-question-answered-dark.png)。一份权威答案结束原工具等待，原 Session 随后继续并完成回合。Web 表单是原有回答入口，这些截图不宣称真实 Lark 表单已验收。

## Channel 历史中的图片

在支持图片的 #1021 候选版本中，已授权的 Lark 图片或受支持的图文消息会显示在原 Channel 气泡内。上方的来源名称仍可打开来源详情。图片进入可见区域时加载；点击图片可放大，加载失败后可点击「重试」。文字和多张图片按原生顺序保留在一条消息中。

需要将 Channel Bridge 的接收目的地设为消息历史。仅 Bot Inbox 的接收不会把图片放入 Channel。应用继续使用既有消息权限：群聊仅 @ 接收时，受支持的原生图文消息仍需真实 @Bot；此功能不会开启普通群消息权限。

停止 Bridge 接收后，已取得的图片仍可查看，但该路径不再取得新图片。解绑身份或撤销来源授权后，该路径连缓存图片也不可访问；另一个独立有效的来源路径保持独立。刷新和重启保留已授权、已取得的图片；清除或缺失的原件不会重新下载。预览支持不超过 25 MiB 的 PNG、JPEG、GIF 和 WebP；超限或不支持的格式会明确提示。

Human 查看图片不会让 Bot 获得图片理解能力，也不改变其注意力、模型上下文或权限。本候选版本的真实平台验收和截图记录在 [#1021](https://github.com/BotHarness/BotHarness/issues/1021)，上方旧的新手引导证据不能代替本次验收。
