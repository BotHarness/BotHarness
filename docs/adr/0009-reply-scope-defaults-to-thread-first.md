---
Status: amended by ADR-0011
---

# Reply scope defaults to thread-first

By default a Bot answers inside a new Thread, falling back to root only when the model switches scope with the reply-scope tool or the operator changes the default. Threads keep busy group chats readable; the per-answer tool covers the cases where a direct reply is clearly better.

## Considered Options

- **Root-first** — rejected: replies from long tasks flood the group.
- **Always model-chosen, no default** — rejected: inconsistent behavior and no configurable policy.
