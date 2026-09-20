---
name: dsh-plugin-dev
description: Establish precise DeepSeek Harness (DSH) and Cordis vocabulary and choose stable architectural seams. Use when designing or reviewing DSH plugins, distinguishing native from application-defined concepts, or deciding among Service, Event, Registry, SessionEvent, Projection, persistence, and execution boundaries.
license: MIT
metadata:
  skillVersion: "0.3.4"
  verifiedAgainst: "dsh 0.1.6-alpha.2"
  upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887"
  verifiedAt: "2026-09-20"
  sources: "pinned DSH upstream and docs/research authoring reports; dsh_research DSH/Cordis foundations"
---

# DSH/Cordis context and decisions

Skill v0.3.4 · verified against DSH `0.1.6-alpha.2` (upstream SHA `ddefc45fbc7f8e46dd73185e68295696d1297887`).

## Foundation-first workflow

1. Read [`references/context.md`](references/context.md) completely. Use its canonical leading words so every important object and boundary maps to one defined DSH/Cordis term. Label downstream concepts as application-defined.
2. Follow [`references/decision-tree.md`](references/decision-tree.md). Give each responsibility one primary seam with explicit ownership and lifecycle.
3. After choosing the seam, verify version-specific API names, signatures, manifests, build behavior, and runtime details against the current DSH official documentation, pinned upstream source, and the running Host.

## Scope boundary

This skill intentionally contains only the stable semantic and architectural layer: Context, canonical vocabulary, concept maps, and decision logic. It does not cache a Host API catalog, Client API catalog, Slot inventory, or community implementation survey. Those details change too quickly to be a trustworthy installed skill.

Historical investigations remain in the canonical BotHarness repository under `docs/research/`; they are evidence for maintainers, not published guidance. A downstream product's Context, architecture, and ADRs remain outside this skill and own its product vocabulary.

## References

- `references/context.md` — canonical DSH/Cordis vocabulary, boundaries, and conceptual architecture.
- `references/decision-tree.md` — requirement-to-seam decisions for dispatch, persistence, execution, and presentation.
