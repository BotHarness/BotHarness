# CLI 在线创建与 DM 调试：首阶段规格

日期：2026-10-11。调研基线：main `51058d540f52de45e687f4274f3d16dd701dd0d5`。

状态：本线程 Q1–Q7 已确认，用户接受第一条已运行链路的输出形式；实施跟踪 [#1363](https://github.com/BotHarness/DeepSeekBot/issues/1363)。本文件是范围规格，实际实现与运行证据另在 issue/PR 记录。决定来源、事实来源与后续范围见 [设计讨论](2026-10-11-cli-debug-design-frontier.md)。

## 可观察结果

在一个正在运行的、已认证的 DSH Host 中，仅通过 CLI 完成：

```text
空白创建 / Zip 导入 / GitHub-Git 导入
→ 读取 Bot 与配置模型
→ 发出具有明确消息 ID 的 Human DM
→ 查询该消息的处理状态与准确关联的持久 Bot 回复
→ 分页读取 Channel 消息、检查 Bot attention 与 Session 活动摘要
```

运行此链路不要求停止 Host，不要求浏览器发送消息；模型可用性由真实回复验证。各命令可单独使用，测试脚本组合命令并断言结果。操作和检查都通过既有生产 owner。

## 连接与数据 authority

- `--host` 或 `DEEPSEEKBOT_HOST` 显式选择在线目标，继续使用既有 authenticated Connection/API Gateway carrier 和凭据输入方式。
- 选定 Host 后，连接、认证、协议或业务失败均返回明确错误，不能改为打开本地 Profile 写入。
- 没有指定 Host 时，保留已有 `--home` 离线维护行为及 writer lease 约束；此阶段不引入自动发现、自动启动 Host 或自动模式切换。
- Host 内的路径、Git 环境和登录属于目标实例；不能将本机文件路径直接传给远端 Host 作为可读取资源。
- CLI 不新建数据库、消息监听者、IM 接收者或 Session 生命周期。

## 首阶段操作范围

以下为业务能力范围。已经公开的命令名保持兼容；新增查询名在实现时确定，并进入统一 help/search 与 Reference。

| 能力             | 所需行为                                                             | 生产入口与注意事项                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bot 发现与读取   | 在线 list/show，可读取创建后的身份及配置。                           | 既有 `list` / `get`；在线信息可包含运行状态。                                                                                                                |
| 空白创建         | 保持当前 name、persona 等输入语义，返回实际新 Bot 身份。             | Registry `create`；不能把 legacy `create.preset` 字符串当作 Model Preset 应用。                                                                              |
| Zip 导入         | 从调用者本机读取归档，上传字节给 Host，再返回导入身份。              | `/api/botharness/bot-zip/import`；复用归档验证与新身份创建。保持当前 CLI 的 name/metadata override 与 preset 行为，必要时扩展 owner 契约或明确报告后续阶段。 |
| GitHub/Git 导入  | 保持 `owner/repo` 简写及已有 Git URL 语义，由 Host 获取仓库。        | `createFromGit`；Host 自身 Git 凭据与网络决定私有仓库能否访问，不增加平台登录向导。                                                                          |
| 模型配置与读回   | 在线查询/创建 Model Preset、应用到 Bot、读取 Model Plan。            | `modelPresets` / `modelPresetCreate` / `modelPresetApply` / `modelPlan`；保留实际 Host 校验和具体操作的版本检查。                                            |
| 内部 DM          | 发送 Human DM，保留请求标识并查询准确关联的状态与回复。              | 已有 `send` / `send-status`，不可把任意随后出现的消息当作本次回复。                                                                                          |
| Channel 查询     | 在线发现 Channel；按 Channel 分页读取持久消息。                      | `channels` / `channelMessages`；保留 limit、before 和 revision 语义。                                                                                        |
| Bot attention    | 有界查询 Source Event/Admission 的资格、处理中、已处理、待修复状态。 | 既有 `botAttention`；使用标准领域词，不把查询结果当成 Orchestrator Observation。                                                                             |
| Session 活动摘要 | 查询 Bot 所属 Session 和相关活动摘要，帮助定位运行阶段。             | 既有 `sessions` / `sessionOwner` / `activitySnapshot` 等有界 owner 查询；不是完整 SessionEvent 日志。                                                        |

当前 CLI 的目录导入已有语义；实现在线分派时应明确维持原有离线入口，并复用 Zip 打包上传路径处理在线目录导入，避免让它误走本地数据库。它无需单独发明导入 owner。

## 输出与失败恢复

- 沿用 CLI JSON 与 `--compact` 约定。输出已知 Bot/Channel/消息标识、实际完成阶段、当前状态及稳定错误，避免要求脚本解析终端描述。
- Bot 创建/导入成功后，模型设置或后续验证失败：保留 Bot 和已经完成的配置，返回已知身份及阶段。修复后继续相应命令，不重新创建。
- 创建前能确定的错误应提前拒绝，例如不合法归档、已确定不存在的指定预设；不能把“提前校验”描述成跨 owner 操作全部原子化。
- 消息等待超时保留原请求回执；继续查询同一请求，不自动重新发送。已处理但未产生回复、需要修复等结果保持现有区分。
- 创建/导入等修改的响应丢失，可能意味着操作已完成。不得自动重试；回执和恢复查询仅承诺 owner 实际能证明的事实。没有已知 Bot ID 或 owner 回执时明确标记结果未知，不能编造成功或宣称安全重试。
- 冲突由 owner 的实际 expected revision/HEAD 契约处理；不静默刷新版本覆盖别人修改，也不宣称所有 RPC 全局串行或通用幂等。
- 测试脚本维护自己创建的资源清单；只显式清理这些资源。清理调用既有删除/lifecycle owner 并检查结果，不直接删除运营数据。失败现场可保留用于调试。
- 认证信息、IM 凭据和任意私密 Provider 响应不进入回执或开发日志。Bot 消息与配置查询继续遵循既有认证和访问范围。

## 交付顺序

每步都交付真实可运行路径，逐步扩展并按仓库 tracer-bullet 流程获取 Human 反馈；三种创建方式全部验收后，才算本首阶段完整完成。

1. **空白创建的完整路径**：显式 Host → 创建/模型配置与读回 → 真实 DM → 精确回复状态与 Channel 读取；同时处理已知身份的部分失败。
2. **Zip 导入的同一路径**：本地文件上传 → canonical import owner → 模型配置 → DM 回复；验证归档/覆盖参数/失败阶段。
3. **GitHub/Git 导入的同一路径**：Host 获取仓库 → 模型配置 → DM 回复；验证简写和既有 URL 行为，以及 Host Git 失败的回执。
4. **有界诊断与脚本验收**：Channel 发现、attention、Session 活动摘要接入 CLI；形成可重复的测试脚本和运行说明。基础查询可提前随第一步交付，不作为脱离运行路径的独立水平基础层。

开始 issue-backed 实施前检查现有 claims 并记录本任务 claim；PR、ledger、架构/Reference 更新及合并检查遵循仓库工作流。已创建 #1363 并记录 task claim。

实施中的必要清理入口补充：`bot-delete-preview` / `bot-delete-confirm --confirmation-stdin` / `bot-delete-retry` 包装既有 PersonaBot Deletion owner，供 Human 和成功后的显式测试清理使用，确认始终 `eraseMemory: false`。这落实测试资源清理要求；不扩展为 Memory 擦除或 Content Purge。

## 验收标准

| 场景          | 合格证据                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 三种创建方式  | 每种方式在运行中的隔离 Host 成功创建一个新身份，CLI 可读回身份与模型配置，并得到该 Bot 对准确请求的真实持久回复。                       |
| 消息对应关系  | 并行或交错发送时，状态查询只能归属自己的消息；其他回复、审批卡、通知不能满足本请求完成条件。                                            |
| 部分成功      | 模型配置/回复验证失败保留已创建 Bot；回执含已知 ID 与失败阶段；修正后继续成功，无隐式重建或删除。                                       |
| Host/认证失败 | 已选择在线目标时停 Host、认证失效或请求失败返回明确错误；没有转为离线打开数据，也没有重复发送修改。                                     |
| 查询          | 在线发现 Channel；limit/before 可分页；attention 与 Session 摘要帮助关联实际运行状态，输出有界。                                        |
| 兼容性        | 原离线维护、JSON/compact、已公开创建输入、DM status/receipt 契约保持；在线导入不误将调用者路径作为 Host 路径。                          |
| 测试编排      | 独立脚本使用业务 CLI 驱动和断言；确定性覆盖重点错误/关联契约；另有隔离 Host 的三种创建真实模型 smoke evidence。生成文字不要求逐字匹配。 |

Focused automated coverage 选择新 adapter、owner contract extension、关联与失败边界；不通过机械镜像实现增加测试。真机 smoke 与并发/失联检查只按具体修改需要运行，不能将源码存在当作运行验收。

## 后续范围

- 外部平台链路：微信先验证 native App → Binding → receiving → 真实入站 → PersonaBot 回复；逐平台扩展飞书、Discord、Slack、QQ，无证据者标为待验收。
- 其余在线管理：Memory、Workspace Grants、Schedules 等按原 owner 接入。
- 业务操作 parity：Bot 删除与 Bot Zip 导出、群成员与群消息、头像/表现设置，保留现有产品语义。
- 更深入诊断：有界 native SessionEvent/工具调用日志和实时跟随；外部 Source/Admission/Outbox 查询随外部链路交付。

这些目标继续保留，但不算首阶段已经实现；后续契约按选定可运行切片展开。内部 CLI DM 成功不能替代真实平台入站、外部可见性或 UI/UX 验收。
