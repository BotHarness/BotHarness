---
title: M2 memory MVP
date: 2026-09-18T14:00:00+08:00
tags: [milestone, core, memory]
---

## M2: memory MVP (#9)

- `@botharness/core` gains the file-first memory layer: YAML front-matter (`summary` / `updated_at` / `sources` / `tags`) with graceful degradation, atomic serialized writes, path jail, generated `MEMORY.md`, and human-owned `PERSONA.md`.
- Tools: `memory_read` / `memory_search` / `memory_write` / `memory_list` (DSH `defineTool`), registered by `apply`. Every write is one commit whose message is the `summary` line, then a `sources: …` line when sources exist, then `source=human` for human edits; per-bot repo, single branch, `.gitattributes` LF; the agent cannot label its own writes `human`.
- No visibility: memory entries carry none — the Bot reads its whole memory in every context, and choosing which files, from which point in time, leave the bot is M6's export step (ADR-0021).
- Prompt: `botharness:persona` and `botharness:memory-tree` sections; tree injection is capped at 1000 entries with an explicit overflow marker.
- 108 tests green; architecture diagrams for modules and boot flow updated.

Deferred: M8 secret scanning lands with M6's export scan; real IM session→PersonaBot resolution lands in M5; live DSH runtime resolution of the externalized `@deepseek-ai/dsh-*` imports still needs a smoke test in the host.
