---
title: M2 memory MVP
date: 2026-09-18T14:00:00+08:00
tags: [milestone, core, memory]
---

## M2: memory MVP (#9)

- `@botharness/core` gains the file-first memory layer: YAML front-matter (`summary` / `updated_at` / `sources` / `visibility` / `tags`) with graceful degradation, atomic serialized writes, path jail, generated `MEMORY.md`, and human-owned `PERSONA.md`.
- Tools: `memory_read` / `memory_search` / `memory_write` / `memory_list` (DSH `defineTool`), registered by `apply`. Every write carries a `summary` that becomes the git commit message; per-bot git repo, single branch, `.gitattributes` LF; the agent cannot label its own writes `human`.
- Visibility: one brain with per-entry `shared`/`private` + owner; tree/search/read are scope-filtered, the generated index lists only `shared` entries, and private files can only be overwritten by their owner's DM scope.
- Prompt: `botharness:persona` and `botharness:memory-tree` sections; tree injection is capped at 1000 entries with an explicit overflow marker.
- 111 tests green; architecture diagrams for modules and boot flow updated.

Deferred: M8 secret scanning lands with M6's export scan; real IM session→scope mapping lands in M5; live DSH runtime resolution of the externalized `@deepseek-ai/dsh-*` imports still needs a smoke test in the host.
