# BotHarness 开发文档

BotHarness 开发文档把四种不同的权威信息分开。先判断需要哪一种答案，不要把所有页面都理解成“当前 runtime 已经实现的行为”。

## Design

[Design](/zh/dev/design) 包含规范产品词汇、规格、PRD 与 living architecture，用于定义目标边界和不变量。Design 可以描述尚未实现的目标；具体状态以各源文档为准。

## Guides

[Guides](/zh/dev/guides) 说明已经核验的实现流程和集成契约。Guide 是操作性说明，不是第二份产品术语表。

## Reference

[Reference](/zh/dev/reference) 从当前代码生成，用于回答这一 revision 实际存在什么 config、model-facing tools 和公开 Cordis event seams。当 Design 与 Reference 不同时，Design 描述目标，Reference 描述当前已经存在的实现。

## Decisions

[Architecture decisions](/zh/dev/adr) 记录重要取舍的原因。ADR 是历史证据；应根据它的状态判断该决策仍然有效、已被取代，还是经过修订。

## 词汇边界

BotHarness 产品术语只由[领域词表](/zh/dev/design/context)定义。DSH 与 Cordis 术语由独立的 [DSH/Cordis Context](/zh/dsh/context) 定义；两边都不重复定义对方的概念。
