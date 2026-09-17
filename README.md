# BotHarness

给 LLM agent 一份**持久身份**的 DSH 插件层：PersonaBot —— 带人格、跨 session 记忆、可并发工作的 Bot。

- **BotHarness**（本仓库）：平台层 —— PersonaBot 实体、记忆、状态与工作方式（SDK + bundle，**不 fork DSH**，ADR-0015）
- **DeepSeekBot**：首个应用 —— 把 PersonaBot 带进 DSH sidebar（创建、@委派、持续工作），并接入飞书 / Lark

## 文档

- 平台规格：[docs/botharness.md](docs/botharness.md)
- 应用 PRD：[PRD.md](PRD.md)
- 领域词表：[CONTEXT.md](CONTEXT.md) · 决策：[docs/adr/](docs/adr/)
- 里程碑与 tickets：仓库 Issues；路线图见规格 §7

## 状态

v1.0 基线完成（平台/应用规格重组、ADR 0015–0018、M1 插件脚手架合入）；下一步 **M1 BotHarness 骨架**（`@botharness/core` + PersonaBot registry + bot home + 状态事件）。

## 灵感

- **Grok Bot**：每个 Bot 有自己的电脑、记忆、状态、自主工作
- **DeepSeek Harness**：插件宿主，承载其他插件

## 开发

工具链：pnpm 12.4.2 · Node ≥22 · TypeScript 7 · oxlint / oxfmt · vitest · tsdown；客户端包（`@botharness/client`）使用 React（DSH 客户端契约）+ blobatar。

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

仓库结构（规划中）：

```text
packages/core        @botharness/core   # registry / memory / state / delegation
packages/client      @botharness/client # React：roster / 详情 / 委派入口
packages/im          @botharness/im     # IM 适配器（后置）
packages/deepseekbot deepseekbot        # bundle + 应用
```

当前 `src/` 为 M1 脚手架（插件入口 + workspace→bot 解析），将迁入 `packages/core` 并降级为 IM 绑定助手。
