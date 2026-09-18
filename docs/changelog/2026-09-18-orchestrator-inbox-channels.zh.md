---
title: Orchestrator Session、Inbox 触发与平台内 Channel
date: 2026-09-18T22:00:00+08:00
tags: [spec, adr, architecture]
---

## 规格 v1.6 — 多 Session 方向

- 平台规格记录了目标拓扑：每个 PersonaBot 一个 **Orchestrator Session**，拥有 Inbox 并调度工作；工作在独立 Session 中进行，可位于不同 Workspace（**ADR-0024**）。工作 Session 不采用 DSH continuable subagent：子级硬拷贝父级的 cwd/preset，subagent 身份被通用恢复/发消息路径 fence，每树默认 8 个激活额度且无排队，父 session id 变化会孤儿化子级。
- **Inbox** 是派生的事件流投影，不是队列：immediate / digest / silent 三类；触发策略（来源开关、窗口、阈值、优先级）由 Host 强制，Settings UI 可编辑（默认 30 秒 / 5 条）；允许忽略；不承诺 exactly-once（**ADR-0025**）。
- **Channel** 是一等平台空间，可桥接外部 Chat；`Channel binding` 改为 **Binding**；Thread 泛化为 Chat 或 Channel 内的子会话（**ADR-0026**）。已同步 `CONTEXT.md`。
- §5 增加编排模型（入口与 Inbox、Orchestrator、工作 Session、跨 Session 总线、状态感知、决策呈现）；§4 增加 **M12**——persona 留在 prompt 前缀，memory tree 改为每 turn 注入的独立消息（替换语义 + 去重），保持 KV cache 稳定性；工具面明确为 `capabilities.tools.allow` + 激活时 `ctx.tools.restrict` + 未知名字先过滤。
- 落地节奏：M3 保持 roster + 委派 + 工位会话（模型的第一个切片）；Inbox、Orchestrator、跨 Session 总线在 M4 后排期；Channel 的 Lark 桥接随 M5。

## ADR

- ADR-0024 — 每个 PersonaBot 一个 Orchestrator Session；工作 Session 是独立 root。
- ADR-0025 — Inbox 是事件流投影，触发策略可配置。
- ADR-0026 — Channel 是平台内一等空间；Binding 连接表面。

## 调研

- `docs/research/2026-09-18-dsh-agent-team-vs-botharness.md`（参考插件对比）以及针对 `deepseek-harness@ddefc45` 的 DSH 能力核查（subagent、session controller、compaction、schedule、webhook）支撑了上述选择。
