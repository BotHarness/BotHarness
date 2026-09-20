# Memory is written only through explicit tools

> Superseded by ADR-0047: Memory mutations now pass through the Memory Service and may originate from Tools, Human UI, or trusted Plugins.

Memory changes happen only when the model calls a memory tool; the PoC has no automatic distillation and no background batch rewriting. Controlled, auditable, revertible writes matter more than convenience, and an automatic writer can silently pollute Memory with prompt-injected falsehoods.

## Consequences

Recall depends on the model choosing to write, so tool descriptions and persona prompts must make writing the obvious move. Every write records its source (chat/date) for audit and rollback (PRD rule M4).
