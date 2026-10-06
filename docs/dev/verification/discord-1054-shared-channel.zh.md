# Discord 共享 Channel 验证 — #1054

Agent 已完成真实验收：一个既有 Discord 接收账号、一个已绑定的成员 PersonaBot，在本地 Group Channel 中仅收原生提及，Message Content 保持 OFF。现有通用运行时已经支持这条路径；本次增加回归测试和证据说明。这是开发来源资格验证，不代表已发布产品 Provider 已升级。

## 实际输入和范围

前三条真实消息使用 Core `ab63a528072771cdb29233137bdb48b210f93434`。冷重启加载 `a81ba50e953b20635ca38e0f182d18923f92a292`，它仅增加共享 Channel 回归测试。Provider 为 `345b63f75ad8acc5b7e42eaab5a4eefdbffed683`；已安装的 `lib/index.js` SHA-256 为 `b5fa453a9b2b6e544cb1d20f20b64415728b1e2333440b1f9ca00e796aa9024e`，与来源构建一致。DSH 为 `0.2.0-rc.1`；实际模型为 `deepseek-official / deepseek-v4-pro`，reasoning off。后续文档和无关 main 集成不替代这些实际运行输入。

Human 明确授权 **Discord Context QA Rebuilt** 加入 **Discord Shared QA 1054**，并临时接入既有 **BotHarness QA / 常规** 来源。使用正常邀请和 profile-policy 接受；没有新增原生目标、账号、凭证或权限。原 Inbox 路径保留；`canPost=false`、原生 App flags `0`、Message Content OFF 和此前合成文件 Workspace 写权限撤销均保持。

## 真实结果

每条原生 Human 提及都只有一个 Source Event、一次成员 Inbox Admission 和一个 provider-accepted Outbox Intent。模型各调用一次 `bridge_read` 和 `bridge_reply`，实际 Tool 结果成功；独立原生读取核对本 Bot 作者、原公开 thread `1556622420222283798`、原消息引用和回复正文。

| 状态／模型回合 | 原生 Human 消息       | 本 Bot 回复           | 收件路径数 | Group placement 数 |
| -------------- | --------------------- | --------------------- | ---------- | ------------------ |
| 连接／14       | `1557041250073444475` | `1557041292771594302` | 2          | 1                  |
| 暂停／15       | `1557043767570210877` | `1557043807608897582` | 1          | 0                  |
| 恢复／16       | `1557043983803224126` | `1557044027457802382` | 2          | 1                  |
| 冷重启／18     | `1557044637255081995` | `1557044674227740873` | 2          | 1                  |
| 恢复原配置／19 | `1557045298210152550` | `1557045336218927187` | 1          | 0                  |

重叠路径共享来源和 Admission，没有第二次 Bot 回合或 DM 镜像。来源 Modal 保留父会话、外部消息 ID、发送人 ID、canonical source ID 和原生子 thread ID。Canonical receipt 的 `conversationId` 归一到父会话；checked reply route 和独立查询的原生消息仍是准确子 thread。消息回复引用不会被伪造为 thread ID。

来源发现、添加、编辑保存、暂停和恢复均使用正常 UI。Message Content OFF 且普通投递尚未验证时，编辑表单禁用全量普通文字。暂停保留历史，独立 Inbox 仍可回复；恢复建立未来收件边界，暂停来源不补录。页面刷新保留每条消息的一份；冷重启前后六组 canonical 表和完整 Channel 消息逐项一致，新鲜原生提及再次证明本身份回复有效。

本地 Human 消息 `DISCORD-1054-LOCAL-ONLY` 经模型回合 17 处理，**Tool 调用、外部 Intent 和原生消息均为零**。连接器不会自动转发本地讨论。

## 正常操作复现

1. 使用已验证的隔离 Profile、checked Discord Provider 和可用绑定 PersonaBot，创建合成本地 Group，正常邀请该 Bot。选用已授权原生 QA 来源。
2. 打开 Group Profile → 频道连接器 → 添加，选择 Discord 与原授权来源，仅收 @ 接收身份并启用；验证重叠时保留原 Inbox 路径。
3. 在原公开 thread 发送合成提及，要求模型读取当前来源并只回复一次。查看来源详情与实际 Tool 结果，独立核对原生作者、thread、引用及 canonical Admission／placement／Intent 数。
4. 关闭连接器，发一条新提及；确认 Group 无新 placement、历史保留，独立 Inbox 只有一次回复。恢复后确认不补录，再发新提及。
5. 刷新并冷重启同一 Profile，比较持久记录并再次发送新提及。发送本地测试消息，确认无外部 Intent／原生消息。
6. 移除临时 Channel 路由，恢复原设置，再发原生提及验证剩余 Inbox 路径。保留已验收历史和审计记录。

## 截图与清理

截图来自中文 Chrome 真实 UI，明暗主题的配置前后对照均为 **1230 × 820**。原生截图仅取 QA thread，尺寸 **590 × 820**，不发布无关服务器内容。[图片清单](../../assets/pr/1054-discord-shared/manifest.json) 记录哈希和来源。这些图展示既有 UI 的配置状态，不声称新增 UI 实现。

**之前：Group 已有成员但没有连接器。之后：临时 Discord 连接器仅收提及，正在收件。**

| 主题 | 之前                                                              | 之后                                                             |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| 明色 | ![明色之前](../../assets/pr/1054-discord-shared/before-light.jpg) | ![明色之后](../../assets/pr/1054-discord-shared/after-light.jpg) |
| 暗色 | ![暗色之前](../../assets/pr/1054-discord-shared/before-dark.jpg)  | ![暗色之后](../../assets/pr/1054-discord-shared/after-dark.jpg)  |

**来源详情保留原生 thread。**

![来源详情](../../assets/pr/1054-discord-shared/source-light.jpg)

**连接、暂停和恢复请求各收到本 Bot 在原 Discord thread 中的一次回复。**

![原生回复](../../assets/pr/1054-discord-shared/native-reply.jpg)

**重启后的历史保留三条外部来源和一条本地消息；暂停来源没有出现。**

![恢复历史](../../assets/pr/1054-discord-shared/recovery-dark.jpg)

临时 Channel 路由已移除。原身份、指纹／目标范围、外部 Grant revision、群策略和 Discord 默认设置未变；`canPost=false`、Message Content OFF、Workspace write=false／revision 4 均核对通过。添加连接器触发现有 canonical 迁移，原 Inbox 收件现在由一个显式 Inbox route 表示，因此 Grant 原始 JSON 不同，但有效权限没有扩大。新本地 Group／成员及四条历史保留供复查；原主题 **system** 已恢复。最终累计为 1 Binding／1 外部 Grant／41 Sources／23 Admissions／17 Outbox／6 placements，包含之前设置与历史。移除临时路由后，已验收的来源、Admission、Outbox 和 placement 逐项保持。

[已净化的模型／原生／canonical／重启／恢复证明](../../assets/pr/1054-discord-shared/model-native-proof.json) 含实际调用与消息 ID。重复投递、未连接 fixture Channel、其他成员可读共享来源但不能借用回复身份、错误平台拒绝和暂停期间延迟事件属于**自动化 fixture**，不声称增加真实账号或伪造原生事件。运行时 schema、UI 实现、原生权限和产品 Provider pin 不变；本机检查与 CI 结果记录在 PR，不能代替上述真实证据。Human 明确要求 Agent 验收替代人工 QA；合并与发布仍是独立动作。
