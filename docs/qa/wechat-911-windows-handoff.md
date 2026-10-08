# 个人微信 Goal：#911 Windows 接手记录

2026-10-08 · 状态：已整合 main，Human 已确认原生输入显示、关闭行为及修复后真实等待命令成功；其余场景仍待，保持 Draft。Human 已明确改为截图验收，暂不提供录像。

## Windows 接手进展（2026-10-08，覆盖下文旧候选编号）

- 接手任务：`codex/local/01a119ff-d4c2-74b0-9ea8-17aa1a3811d0`，认领见 [#911 comment](https://github.com/BotHarness/DeepSeekBot/issues/911#issuecomment-6053099542)。继续同一个 Draft PR #1102。
- main 基线：`006c0fa3`。保留新身份/会话弹窗、默认接入、多个同平台应用、外部会话接入及现有 Lark/Slack/Discord 能力。
- main 已占用 ADR-0142/0143 和 generation 61–65；本票候选顺延为 [ADR-0144](../adr/0144-wechat-typing-follows-owned-processing-leases.md) / generation **66**，不改 main 的迁移历史。迁移覆盖从 59–65 升级并保留原有 Lark 审批配置。旧 `.911.1`–`.911.3` QA Profile 均不是当前候选的升级来源。
- Provider 整合 `55b4528480ccce3e8acc067e10b880556bf5034c` 至现有 typing 分支，候选提交 `7c2489da79017e9c6a86e36898698a9b82c65a52`；产品固定 `.14`，404 runtime 文件，摘要 `2736154321b9966fdcbc513e3f5ae763f8f78fd8d2dce374d232e36d084930b0`。无 npm 发布。
- Windows Node 24.21.0 / pnpm 12.4.2；独立 main 对照和候选 Profile 均通过认证 API 启动。当前候选为实际产品压缩包 `0.0.0-test.911.7`，同一隔离 Profile 由 `.911.6` 空闲重启升级；本机私有模型凭据注入，`.911.5`、`.911.6`、`.911.7` 均有实际模型调用和已保存的 Channel 回复。
- Human 已重新扫码、绑定。真实微信私聊的原生“对方正在输入”由 Human 确认并提供[截图](../assets/pr/911-wechat-typing/native-input-visible.png)。最初等待命令在原生沙箱启动前失败；Human 确认错误回复收到且输入提示消失，这只算失败清理证据。
- Windows 原生沙箱诊断确认 QA Memory 与 Assignment 目录的当前用户权限缺少 `WRITE_OWNER`。经 Human 限定授权，用 DSH 自带的备份修复脚本逐目录添加当前用户 FullControl，保留 owner、deny 和 sandbox 限制。Memory 修复后，同一原生 Session 的 `pwsh` 实际等待约 32.8 秒，stdout 为 `911-COMPLETE-A`，工具结果无错误，`bridge_reply` 接受，Human 确认收到成功回复。Assignment 目录已完成权限写入，但原生 Assignment 执行仍待复验；备份及恢复脚本仅在本机。
- 重启 `.911.7` 后配对、绑定和已保存的关闭偏好仍在，瞬态输入阶段为 idle。偏好关闭时，真实微信 `911-OFF-A` 工作的 canonical Inbox 从 running 到 handled，输入阶段全程 idle；Human 确认未显示输入提示，并提供[成功回复截图](../assets/pr/911-wechat-typing/native-off-completed.png)。不能将该重启检查当作处理中 disposal/重启清理已通过。
- 当前检查：lint、format、TypeScript、构建和产品打包通过；BotHarness 聚焦回归 **6 文件 / 83 测试**通过，后续可见开关标题的 Client 回归 **4/4**通过。Provider 微信输入/收件、Lark 卡片、Slack/Discord 相关 **65/65**通过，包校验通过。
- Windows Provider 首次全套：3,660 通过、39 失败、7 跳过；失败涉及换行字面量、POSIX mode 断言及 updater 状态写入，不能宣称全套通过。updater 最小用例在固定 Provider 基线 `55b452` 同样失败，相关源码和测试无差异，原因未确认。BotHarness 全套亦未通过：最小 runtime 测试断言通过但 Windows 临时目录清理报 EPERM，固定 main `006c0fa3` 同例同样报错。此前 WSL 全套结果仅属于旧候选。
- Standards / Spec 两轴审查已完成，发现的清理失败诊断缺失、ADR rollback generation 过期均已修正并复核；无剩余确认代码缺陷。PR Lens 两主题已生成并目视检查，尚未发布至 PR。
- Human 明确要求“暂时不提供影像，有截图就好了”；本次按截图及现场观察验收，没有动态录像，不再将录像列为接手阻塞。运行日志只用于核对真实命令及 canonical 来源，不能替代 Human 的原生显示观察。
- 仍待：关联 Assignment 原生执行、共享处理/steer、停止、授权拒绝/恢复、处理中 disposal/重启、前后两主题截图、最终指南、最终提交/CI 与 PR 证据。保持 Draft，#911 不关闭，#912 不混入；合并和部署仍各需授权。

下文保留 2026-10-07 的原始交接事实与步骤；其中 `.13`、`.911.3`、generation 61 和旧 Provider pin 属于历史候选，当前接手使用以上版本。

目标仍是完成 [#903–#912](https://github.com/BotHarness/BotHarness/issues/902)，参照 [#48](https://github.com/BotHarness/BotHarness/issues/48)。#903–#910 已关闭；#911、#912 仍打开。#910 的真实主动文字投递与后续 canonical Inbox 收件已由 Human 确认，PR #1081 已合并；这些证据不能代替 #911 输入状态验证。

## 代码与认领

- BotHarness 分支：[`codex/911-wechat-typing`](https://github.com/BotHarness/BotHarness/tree/codex/911-wechat-typing)。沿用该票 Draft PR，不再创建第二个 #911 PR。
- 本次已整合 main `009e020becc360763a8506fa1d95024b847e9c72`（包含 #1075 Lark 审批），保留最新 main 的原有能力。
- 原任务认领：[issue comment](https://github.com/BotHarness/BotHarness/issues/911#issuecomment-6031570739)，任务 `codex/local/01a112f7-9794-7692-9b17-b71aa980b313`。本任务为迁到 Windows 交接；接手任务按 agent-work-trace 留下自己的认领并引用本记录。
- Provider 维护 fork 分支：[`DoodleBears/dsh-im:codex/911-wechat-typing`](https://github.com/DoodleBears/dsh-im/tree/codex/911-wechat-typing)。提交 [`d93f6236e4800dce06fc96506fc0e6a5b760476b`](https://github.com/DoodleBears/dsh-im/commit/d93f6236e4800dce06fc96506fc0e6a5b760476b)，基于 main 原固定版本 `4f4f0a6282580bb59968eb90571778eb7e37ee73`。已推送；未提交上游 PR、未发布 npm。
- 候选固定版本：`@botharness/im-provider@4.32.0-botharness.13`，398 个 runtime 文件，SHA-256 `8eaee5405a42a747a66c891ab0c9fb2fc3c4f2e61b1029469ce965490d75e663`；原 manifest/lock 摘要不变。Lark 图片和 main 的审批能力不能丢失。
- ADR 为 [ADR-0144](../adr/0144-wechat-typing-follows-owned-processing-leases.md)，微信偏好迁移为 generation **61**。main 的 ADR-0140 / ADR-0141 和 generation 60 均保留。测试覆盖从 59、60 升级并保留 Lark 审批配置。

## 已实现的候选行为

```text
自己的已授权微信私聊 Source Event
  → canonical Messaging 校验 Binding / Grant / Registration
  → 实际 Orchestrator、已接受 steer、关联 Assignment 的共享处理 handle
  → Provider-private getConfig ticket + sendTyping
  → 每五秒有界续期，最多十分钟
  → 最后一个处理者结束、取消、失败或授权失效后原票据取消
```

不创建第二套 Session 或消息存储，不借用其他 Bot 的身份，不把无关本地 Channel 工作当作微信输入。只有身份偏好持久化；原生票据、私有上下文、处理 handle 和 accepted 活跃状态不持久化。Identity 表格/编辑弹窗已有中英文开关和 requesting / accepted / unavailable / cleanup-unconfirmed 状态。接口 accepted 只表示请求被接受，不能证明原生客户端显示、送达或已读。

主要文件：`messaging/typing.ts`（共享生命周期），`messaging/outbound.ts`（canonical authority），`runtime/bot-runtime.ts`（实际处理与 Assignment acceptance），`messaging/dsh-im.ts`（versioned checked Service seam），Client `external-identity-table.tsx` / `locale.ts`（偏好与诊断）。Provider 的 `external-typing.mjs` 负责私有原生操作、期限和取消。

## 验证事实与限制

- Provider 最终 `npm run check`：**3,618 passed，0 failed / skipped**，包校验通过。
- 较早 Provider 全套曾出现 Dingtalk 时间断言失败；原始 parent 与候选的该文件单跑均为 104/104，最终全套通过。原因未证实，不能宣称已定位。
- BotHarness 较早基线全套：**3,012 passed，9 skipped**。这是整合最新 main 和新增两项 Assignment 测试之前的结果，不能当作最终提交的全套结果。
- 当前 main 整合后的相关检查：**83 passed**（微信处理生命周期、真实 runtime Assignment overlap/acceptance、数据库迁移、产品固定版本、Lark 审批）；typecheck、format、lint、build 通过。
- 本次最终候选 `0.0.0-test.911.3` 在全新 WSL 未配对隔离 Profile 启动，认证 `botharness/list` 返回 HTTP 200 / 成功 envelope；umbrella、Core、UI 的实际安装版本均为 `.911.3`，Provider 为 `.13`。此前 `.911.2` 也通过认证 `list` / `releaseInfo` 验证，但已被最终候选取代。**这些启动检查不是原生微信 E2E。**
- **没有 #911 真实原生输入状态截图或录像，没有 Human #911 验收，没有合并/部署授权。** 二轴代码审查和 PR Lens 渲染也尚未完成。

本次阻塞：WSL Host 的端口和认证接口在本机探测正常，但 Codex 浏览器访问失败（自动导航曾被阻止，Human 打开后得到 `ERR_HTTP_RESPONSE_CODE_FAILURE`）。浏览器不通的原因未定位，不能据此宣称防火墙、代理或 Host 已坏。按 Human 指示迁到 Windows，不继续反复访问旧链接。

## Windows 接手顺序

1. 在 **Windows 本地文件系统的 checkout** 开新 Codex 会话，读取本记录、#911、Draft PR、当前 `AGENTS.md` 与 `dsh-plugin-dev` / `dsh-dev` / `dsh-ui`。先核对最新 main、认领和现有 PR；若 main 又前进，先整合，再核对 Provider 固定版本、ADR 编号和 schema generation。
2. 用 Node 24.21.0 / pnpm 12.4.2。读取 `docs/agents/ax-model.md`、`docs/client-bridge.md` §7。新 Windows QA Profile 的模型凭据必须在本机配置，并用真实 DM 回复验证可用；GitHub 不包含凭据。
3. 先在最新 main 的独立 Windows QA 实例补拍身份设置/编辑弹窗的改动前 light/dark 截图，保留该实例作对照。之后启动独立 #911 候选 Profile；微信由 Human 重新扫码，发送本次唯一初始化私聊消息。旧 WSL 配对、QA 数据和凭据未上传，不应从 GitHub 查找它们。
4. 构建并验证**产品压缩包**，通过 AX helper 启动；不要只测源码链接或直接调用 Provider。以下相对目录均为该 checkout 下的本机隔离 QA 目录，不提交其中数据：

```powershell
git clone --branch codex/911-wechat-typing https://github.com/BotHarness/BotHarness.git BotHarness-wechat-911
Set-Location BotHarness-wechat-911
corepack pnpm install --frozen-lockfile
git clone https://github.com/DoodleBears/dsh-im.git reference/dsh-im
git -C reference/dsh-im checkout d93f6236e4800dce06fc96506fc0e6a5b760476b
corepack pnpm build
node scripts/product-artifacts.mjs --output tmp/911-product-windows --provider-source reference/dsh-im --version 0.0.0-test.911.3
node scripts/dev-instance.mjs --home tmp/911-qa-windows --port 31910 --product-artifacts tmp/911-product-windows --json
```

5. 认证桥接、正确包版本及真实模型回复均可用后，做受控的**同一微信私聊真实工作**，由 Human 观察并录制原生输入提示、正常完成及停止/失败后的消失；同时核对 canonical Inbox 来源和真实处理。不能用 Mock、Host 日志或请求成功代替原生显示证据。
6. 验证偏好关闭、Binding 关闭、Grant 撤销/恢复、Provider disposal、重启以及无关本地 DM 不请求输入；观察 relevant refusal/recovery。共享 Channel 读权限不能借用接收身份。保留原生 author/time/message ID/Source Event ID/trusted route；所有私有票据留在 Provider。
7. 通过 CUA 补拍 Client 前后 light/dark 图；Human 录制微信。删去有效 QR、tokens、凭据、无关聊天。更新两份 canonical 微信指南与两份 IM integration guide，替换其中“pending”说明为已验证事实；附 GitHub 可渲染图片/视频。完成 `visual-pr` / `show-me` 和验证、检查两主题的 PR Lens 图，以及 Standards / Spec 两轴审查。
8. 运行合适的最终回归和 Windows packaged-product E2E，将结果同步到**同一 #911 PR**，再请求 Human QA。验收前保持 Draft，#911 不关闭；合并和部署分别需要新的明确授权。#912 在下一票独立 PR 继续，不混入 #911。

## 数据库与本机资源注意

迁移是 forward-only。旧 `.911.1` / `.911.2` smoke Profile 曾使用本票早期的 generation-60 微信偏好布局；main 现在的 generation 60 属于 Lark 审批。**不要将这些旧候选 Profile 当作新版本升级源**，使用新的 Windows 隔离 Profile。既有正常 main Profile 如需升级，先通过既有备份机制保存；不要修改 migration history 或迁移摘要绕过恢复检查。

交接前已逐一核对准确 PID 的命令与 QA home，停止本任务 WSL 的 #910 基线及两个未配对 smoke Host；31910 / 31911 / 31912 均已不监听，避免 Windows 新配对与旧 Consumer 同时运行。只保留本机 Profile 文件、启动摘要、cookie 与凭据，没有删除配对或解绑微信。这些私有文件未交付到 GitHub；旧登录链接已经失效，Windows 须使用自己的新启动链接。

Provider 上游贡献在原生资格验证后再评估；上游合并不是 BotHarness release 前提。始终保持一票一 PR、不接 WeCom、微信原生操作由 Human 完成、每票交付后等待 Human QA。
