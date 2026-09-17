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

- v1.1 规格：SoulSnapshot / Soul registry 决策（ADR-0019/0020）
- **M1 BotHarness 骨架**已合并（PR #13；`@botharness/core`：PersonaBot registry / bot home / 状态事件，38 tests 全绿）
- 下一步：M2 记忆 MVP（#9）→ M3 Roster 与委派（#10）

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

本地文档预览（WSL 友好，稳定域名）：

```bash
pnpm dev           # → https://docs.botharness.localhost（首次生成本地 CA 并请求系统信任，可能要 sudo）
PORTLESS_PORT=8788 PORTLESS_HTTPS=0 pnpm dev   # 免 sudo 版 → http://docs.botharness.localhost:8788
pnpm docs:dev      # 不用 portless 的直连方式 → http://localhost:4321
```

> portless 从 `apps/docs` 包内启动（显示名在该包 `package.json` 的 `portless` 字段）；Windows 有 Hyper-V 保留端口段（如 1349–1448），选端口时避开。

仓库结构（monorepo）：

```text
packages/core        @botharness/core   # PersonaBot registry / 状态（记忆在 M2）
packages/client      @botharness/client # React：roster / 详情 / 委派入口（M3）
packages/im          @botharness/im     # IM 适配器（M5）
packages/deepseekbot deepseekbot        # bundle + 应用（后续）
```

M1 脚手架（插件入口、settings 命名空间、workspace→bot 解析）已迁入 `packages/core`；解析保留为 IM 绑定助手。
