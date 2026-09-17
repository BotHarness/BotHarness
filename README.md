# BotHarness

**中文** ｜ [English](./README.en.md)

给 LLM agent 一份**持久身份**的 DSH 插件层：PersonaBot —— 带人格、跨 session 记忆、可并发工作的 Bot。

- **BotHarness**（本仓库）：平台层 —— PersonaBot 实体、记忆、状态与工作方式（SDK + bundle，**不 fork DSH**，ADR-0015）
- **DeepSeekBot**：首个应用 —— 把 PersonaBot 带进 DSH sidebar（创建、@委派、持续工作），并接入飞书 / Lark

## 文档

- 平台规格：[docs/botharness.md](docs/botharness.md)
- 应用 PRD：[PRD.md](PRD.md)
- 架构与数据流（持续维护，mermaid）：[docs/architecture/botharness-architecture.md](docs/architecture/botharness-architecture.md) · 文档站 https://botharness.ai
- 领域词表：[CONTEXT.md](CONTEXT.md) · 决策：[docs/adr/](docs/adr/)
- 里程碑与 tickets：仓库 Issues；路线图见规格 §7

## 状态

- v1.0 基线完成（规格重组、ADR 0015–0018）
- **M1 BotHarness 骨架**在 PR #13（`@botharness/core`：PersonaBot registry / bot home / 状态事件，38 tests 全绿），待合并
- 下一步：M2 记忆 MVP → M3 Roster 与委派

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

仓库结构（monorepo）：

```text
packages/core        @botharness/core   # PersonaBot registry / 状态（记忆在 M2）
packages/client      @botharness/client # React：roster / 详情 / 委派入口（M3）
packages/im          @botharness/im     # IM 适配器（M5）
packages/deepseekbot deepseekbot        # bundle + 应用（后续）
```

M1 脚手架（插件入口、settings 命名空间、workspace→bot 解析）已迁入 `packages/core`；解析保留为 IM 绑定助手。
