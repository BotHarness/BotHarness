# 个人微信 Goal：#911 Windows 接手记录

2026-10-07 · 状态：候选代码已同步，真实微信输入状态验收未完成。

目标仍是完成 [#903–#912](https://github.com/BotHarness/BotHarness/issues/902)，参照 [#48](https://github.com/BotHarness/BotHarness/issues/48)。#903–#910 已关闭；#911、#912 仍打开。#910 的真实主动文字投递与后续 canonical Inbox 收件已由 Human 确认，PR #1081 已合并；这些证据不能代替 #911 输入状态验证。

## 代码与认领

- BotHarness 分支：[`codex/911-wechat-typing`](https://github.com/BotHarness/BotHarness/tree/codex/911-wechat-typing)。沿用该票 Draft PR，不再创建第二个 #911 PR。
- 本次已整合 main `009e020becc360763a8506fa1d95024b847e9c72`（包含 #1075 Lark 审批），保留最新 main 的原有能力。
- 原任务认领：[issue comment](https://github.com/BotHarness/BotHarness/issues/911#issuecomment-6031570739)，任务 `codex/local/01a112f7-9794-7692-9b17-b71aa980b313`。本任务为迁到 Windows 交接；接手任务按 agent-work-trace 留下自己的认领并引用本记录。
- Provider 维护 fork 分支：[`DoodleBears/dsh-im:codex/911-wechat-typing`](https://github.com/DoodleBears/dsh-im/tree/codex/911-wechat-typing)。提交 [`d93f6236e4800dce06fc96506fc0e6a5b760476b`](https://github.com/DoodleBears/dsh-im/commit/d93f6236e4800dce06fc96506fc0e6a5b760476b)，基于 main 原固定版本 `4f4f0a6282580bb59968eb90571778eb7e37ee73`。已推送；未提交上游 PR、未发布 npm。
- 候选固定版本：`@botharness/im-provider@4.32.0-botharness.13`，398 个 runtime 文件，SHA-256 `8eaee5405a42a747a66c891ab0c9fb2fc3c4f2e61b1029469ce965490d75e663`；原 manifest/lock 摘要不变。Lark 图片和 main 的审批能力不能丢失。
- ADR 为 [ADR-0142](../adr/0142-wechat-typing-follows-owned-processing-leases.md)，微信偏好迁移为 generation **61**。main 的 ADR-0140 / ADR-0141 和 generation 60 均保留。测试覆盖从 59、60 升级并保留 Lark 审批配置。

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
- 源码候选已打包。本次最终重新打包版本为 `0.0.0-test.911.3`；此前 `.911.2` 在 WSL 独立未配对 Profile 的认证 `botharness/list` / `releaseInfo` 启动验证通过，**这不是原生微信 E2E**。最终版本的启动结果以本票 GitHub 交接评论为准。
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

WSL 仍保留 #910 已配对基线和未配对 smoke 实例，只有本机有启动 PID、登录 URL、cookie 与模型凭据。它们未交付到 GitHub，也不构成 Windows 环境。需要关闭时只核对并停止对应 QA home/port 的准确 PID，不使用宽泛进程匹配。当前会话没有改变或解绑 Human 的微信。

Provider 上游贡献在原生资格验证后再评估；上游合并不是 BotHarness release 前提。始终保持一票一 PR、不接 WeCom、微信原生操作由 Human 完成、每票交付后等待 Human QA。
