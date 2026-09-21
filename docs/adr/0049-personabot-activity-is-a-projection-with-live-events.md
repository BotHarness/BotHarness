---
Status: Accepted
Date: 2026-09-21
---

# PersonaBot activity is a projection with live Cordis notifications

DSH SessionEvents remain the durable execution facts, and explicit Session Ownership identifies each Orchestrator or Assignment Session. BotHarness derives one application-defined PersonaBot Activity Projection from those facts and live liveness, then emits `botharness/personabot/activity` with a monotonic revision after the projection changes; consumers query the projection first and use the Cordis Event only for process-local synchronization. BotHarness does not create duplicate SessionEvents.

Presentation resolution is deterministic, not a configurable priority system: active Orchestrator work is shown unless it is explicitly waiting on Assignments; one active Assignment tool kind selects its matching effect, while concurrent differing kinds collapse to generic `working`. Waiting, blocked, approval, and informational attention are orthogonal indicators and Human Inbox inputs.

Tool activity notifications expose stable `toolKind`, optional `toolName`, a SessionEvent reference, and only tool-declared `publicDetail`. Complete arguments and results require an authorized Capability lookup. PersonaBot output committed to a Channel emits a separate output notification carrying the public message reference and content, so TTS and Live2D integrations never depend on arbitrary Tool arguments or uncommitted drafts.

Every Client binding renders the same projected activity through one Avatar module. Default deterministic Blobatar media may animate for thinking and working; Human-supplied image media remains still while the shared Activity Frame animates. Group bindings may render a bounded facepile. This supersedes ADR-0032's deferral of motion and custom-avatar rendering, while retaining its DSH-native token and dependency constraints.
