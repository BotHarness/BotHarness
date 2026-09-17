---
title: M2 记忆 MVP
date: 2026-09-18T14:00:00+08:00
tags: [milestone, core, memory]
---

## M2：记忆 MVP（#9）

- `@botharness/core` 落地文件优先的记忆层：YAML front-matter（`summary` / `updated_at` / `sources` / `tags`）与降级、原子写 + 串行、路径 jail、生成的 `MEMORY.md`、人属 `PERSONA.md`。
- 工具：`memory_read` / `memory_search` / `memory_write` / `memory_list`（DSH `defineTool`），由 `apply` 注册。每次写入一个 commit，message 首行为 `summary`，有 `sources` 时次行为 `sources: …`，人改附 `source=human`；每 PersonaBot 一个 repo、单分支、`.gitattributes` LF；模型不能把自己的写入标成 `human`。
- 无可见性：记忆条目不携带任何可见性——Bot 在任何场景读取全部记忆；哪些文件、哪个时间点离开 Bot，由 M6 导出时选择（ADR-0021）。
- 注入：`botharness:persona` 与 `botharness:memory-tree` 两个 prompt section；目录树上限 1000 条，超出显式折叠标记。
- 108 个测试全绿；模块与装载流程架构图已更新。

延后：M8 密钥扫描随 M6 的导出扫描落地；真实 IM 的 session→PersonaBot 解析在 M5；external 化的 `@deepseek-ai/dsh-*` 导入在宿主里的实际解析仍需一次 smoke test。
