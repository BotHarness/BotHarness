---
title: PersonaBot navigation and Assignment terminology
date: 2026-09-20T12:00:00+09:00
tags: [product, ui, architecture, terminology]
---

- Updated ADR-0029 so a PersonaBot DM owns a contextual right-side navigation surface: Chat and Memory are primary destinations, with the PersonaBot's Assignments listed directly underneath. Group Channels do not show this navigation, and the Orchestrator Session is never presented as an Assignment row.
- Kept the personal-bot interaction model: the Human talks only through the DM. The Orchestrator may create, reuse, coordinate, and stop several Assignment Sessions without asking the Human to open execution Conversations.
- Chose **Assignment** for the Human-meaningful line of activity, **Assignment Session** for its independent DSH root Session, and **Assignment Agent** for the DSH Agent executing inside that Session. Work and Worker were retired because they are easy to confuse in speech and typing and blur the boundary with DSH Subagents.
- Preserved ADR-0017's no-Task decision. An Assignment has no separate durable identity or lifecycle; the DSH Session id of its Assignment Session is canonical. The Assignment Directory is a read model over explicit Session ownership, DSH facts, and semantic reports.
- Set the first UI tracer bullet to Chat plus files-first Memory: select a PersonaBot DM, browse/read a Memory file, edit and save it, then inspect Git history and the diff. The Assignments list follows the runtime read model; Graph and other derived Memory views remain deferred.
- When the DSH sidebar collapses, the Bot-mode Roster becomes a scrollable icon rail showing all visible PersonaBots and Channels. Selection switches the DM or group Channel without reopening the sidebar.
- Reserved Connections as a future PersonaBot-navigation destination for Bot-scoped MCP-like capabilities, external bindings, webhook ingress, and trigger configuration; no inactive placeholder ships before that behavior is designed.
