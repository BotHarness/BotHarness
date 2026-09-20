# DSH/Cordis Context 与决策

Skill v0.3.4 · 已针对 DSH `0.1.6-alpha.2`（上游 SHA `ddefc45fbc7f8e46dd73185e68295696d1297887`）验证。

## Foundation-first 工作流

1. 完整阅读 [`references/context.zh.md`](references/context.zh.md)。使用其中的规范 leading words，让每个重要对象与边界都对应一个明确定义的 DSH/Cordis 术语；下游概念必须标明为 application-defined。
2. 按 [`references/decision-tree.zh.md`](references/decision-tree.zh.md) 做决策。每项职责只选择一个 primary seam，并明确 ownership 与 lifecycle。
3. 选定 seam 后，再以当前 DSH 官方文档、固定版本上游源码和实际运行的 Host 核验具体 API 名称、签名、manifest、构建行为与运行时细节。

## 范围边界

本 skill 有意只保留稳定的语义与架构层：Context、规范术语、概念图与决策逻辑。它不缓存 Host API 目录、Client API 目录、Slot 清单或社区实现调查；这些细节变化太快，不适合作为可信的已安装 skill。

历史调查继续保留在 BotHarness canonical 仓库的 `docs/research/` 下；它们是供维护者查证的证据，不是对外发布的指南。下游产品自己的 Context、architecture 与 ADR 位于本 skill 之外，并拥有自己的产品词汇。

## 参考文件

- `references/context.zh.md` — DSH/Cordis 规范词汇、边界与概念架构。
- `references/decision-tree.zh.md` — dispatch、persistence、execution 与 presentation 的 requirement-to-seam 决策。
