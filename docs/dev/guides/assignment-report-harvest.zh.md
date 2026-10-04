# Assignment Report 批次与来源历史

本指南记录在 DSH 0.2.0-rc.1 上通过真实模型核验的 [#194](https://github.com/BotHarness/BotHarness/issues/194) 窄切片。Assignment Report 是 application-defined 的持久 Source Event，被接收到所属 PersonaBot 的 Bot Inbox；边界见[架构](../../architecture/botharness-architecture.md)。来源策略、ready-set harvest 与 observation 均由 Host 管理。

## Human 操作

1. 请已授权的 PersonaBot 创建一个 Assignment：先报告两条 progress，再等待一个无害工具审批，之后报告完成。
2. 打开 Channel 侧栏的 Bot 收件箱。两条 progress 各自独立、待处理且可导航。默认 Conditional Assignment Report 策略下，这些信息性进度不会启动另一个 Orchestrator Turn。
3. 点击 progress 条目，打开所属的原生 DSH Session。查看不等于 Bot 观察，也不会唤醒；之后返回 Bot 模式。
4. 对准备好的工具允许一次。Assignment 提交 completed Report，Orchestrator 收取待处理批次，并回原 DM。
5. 在 Bot 收件箱展开 Assignment 分组与已处理历史。两条 progress 和 completed 仍是三个独立的已处理来源。刷新后可再次打开来源。

本验收场景的原生工具只是一个 1 秒 Node timer，不修改文件。单次审批是 QA 操作，不属于 Assignment 自行授予的权限。

## 已核验行为

| 阶段                        | 原生执行                                                                    | 持久来源投影                                          |
| --------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| 两条 progress、timer 待审批 | 一个初始 Orchestrator Turn，progress 没有新增唤醒                           | 两个独立、待处理的 progress 来源                      |
| 单次审批后完成              | 只新增一个 harvest Turn、一个模型可见 Inbox 投递；含 `repeats 3` 与最新摘要 | 三个独立 ID、同一观察时间及处理时间；均已处理且可导航 |
| Human 打开来源              | 真实认证的原生 `session/follow` 指向所属 Session                            | 来源状态／观察时间不变，没有新增 Orchestrator Turn    |

Assignment 的三个 `report_to_orchestrator` 调用都有成功的原生 Session 结果。全部完成 DM marker 晚于 completed Report 的成功结果。Turn／投递断言来自完整原生 snapshot，而不是回复条数。

[真实截图与公开证明](https://github.com/BotHarness/BotHarness/blob/main/docs/assets/pr/194-report-harvest/README.md)记录本次执行。现有生产路径通过，本次增加证据和可复现核验；不关闭 #194，也不声称验证了 Report／Lifecycle Notice 配对、强原因升级、中断或活动回合的重启恢复；普通待处理进度的冷启动场景见下文。并发限制与答复投递结算仍由独立任务负责。

## Agent 复现

用 `scripts/dev-instance.mjs` 启动全新隔离 Profile。将 `BH_E2E_ORIGIN` 设为 loopback URL、`BH_E2E_HOME` 设为该 home、`BH_E2E_EVIDENCE` 设为私有目录，再执行：

```bash
node scripts/e2e-assignment-report-harvest.mjs prepare
node scripts/e2e-assignment-report-harvest.mjs complete
```

`prepare` 使用真实 Orchestrator／Assignment 模型请求，检查待处理来源并截图实际 UI。`complete` 通过认证 Human Gateway 做 timer 单次审批，核验原生 Report 与批次，再截图已处理历史。`verify` 只读重复完成核验和截图；`capture` 只重复 UI／来源导航核验。两个只读模式都不启动模型请求。

凭据、原始 Session 内容、工具参数／结果、机器路径和登录 URL 留在私有目录。公开记录仅含有界 QA marker、来源 ID、原生结果时间及已核验结果。截图使用真实 Profile 与所选 Assignment 的 Bot 收件箱，工具审批参数位于截图视图之外。

## Host 重启后的待处理报告

第二次真实 DSH 0.2.0-rc.1 验证以已结束回合的一个 Assignment 和两条普通进度报告为起点，使用内建 Conditional 来源策略，冷启动同一个隔离 Profile：

| 边界                           | 已核验结果                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 重启前                         | 两个独立且未观察的进度来源；Assignment 空闲；Orchestrator 一个已结束回合                                                    |
| 新 Host 进程、同一隔离 Profile | Assignment 与 Orchestrator Session ID、报告来源 ID／内容／创建时间保持一致；两条仍待处理且可导航，没有重放回合或 Inbox 投递 |
| 下一条 Human 私聊              | 一个新回合收割两个原始来源一次，显示最新摘要和 repeats 2；两个来源同批处理                                                  |
| Human 打开来源                 | 经过认证的原生 Session 导航，不改变观察状态或新增回合                                                                       |

这个结论仅涵盖已结束 Assignment 的普通待处理进度；不代表活动／已观察回合的崩溃恢复、失败／升级或终态 Report 与 Lifecycle Notice 的因果配对已验收。[真实重启截图和证明](https://github.com/BotHarness/BotHarness/blob/main/docs/assets/pr/194-report-restart/README.md)。

Agent 复现使用新的隔离 Profile 及上文三个环境变量：

```bash
node scripts/e2e-assignment-report-restart.mjs prepare
# 只停止已核实的该启动器 Host PID，再用相同 home／port 启动。
node scripts/e2e-assignment-report-restart.mjs after-restart
node scripts/e2e-assignment-report-restart.mjs harvest
node scripts/e2e-assignment-report-restart.mjs verify
```

重启是验证脚本之外的明确操作。两份启动记录保持私有，继续前核对替换后的 PID 和认证 API；不要停止共享进程。after-restart 和 verify 不发模型或工具请求；harvest 只提交一条真实 Human 私聊，不创建 Assignment，也不操作 Shell／文件。capture 仅读取当前状态并验证来源导航。可选 BH_E2E_STATE 指向私有场景文件，允许复核先前场景而不覆盖待 Human 验收的场景。

Human QA 时打开已准备好的重启后 Bot，检查两条待处理进度并打开一个来源；回到 Bot 私聊发送 RESTART_HARVEST。Bot 应回复 RESTART_REVIEWED，刷新后两个原条目仍留在已处理历史。真实 QA 模型请求消耗的 token 正常计入用量。
