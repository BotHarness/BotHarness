---
Status: Accepted
Date: 2026-09-25
---

# The checked-out Git working tree is current Memory

## Context

The earlier Memory contract treated BotHarness's accepted-commit ledger as an admission gate. Markdown-only and linear-history validation kept uncommitted files, native Git merges, external histories, and binary files out of the Channel Memory view. This contradicted the Human's intended model: a PersonaBot owns a normal Git repository, and the Agent can use native file and Git tools to organize its Memory.

## Decision

The files in the checked-out Memory Repository working tree are the PersonaBot's current Memory. A file is available as soon as the working tree changes; no separate acceptance call, commit, or per-branch admission is required. Ordinary Git history, merges, resets, branch switches, code, and binary objects are valid repository state. The Orchestrator chooses how to incorporate an external repository from the Human's request, asking through DSH's native question seam when merge, replacement, or destination is ambiguous. Initial PersonaBot creation may import a Git URL (#298); integration into an existing Bot's Memory remains an Orchestrator-led native Git operation.

The application-defined Memory Service still owns PersonaBot-to-repository identity, trusted Session ownership, bounded Host-to-Client queries, and audit/recovery checkpoints. A successful Orchestrator turn may record its current HEAD with trusted Source Event and Session attribution. This observation never stages, commits, resets, or hides working-tree files. Git authorship and BotHarness's trusted operation attribution remain distinct. The Git repository is the authority for current files and branch history; the audit ledger is an auxiliary record.

Git decides whether a branch operation can preserve staged and working-tree changes. BotHarness reports Git refusal in the Channel and allows the Orchestrator to coordinate Assignments or ask the Human; it does not require a branch tip to appear in the audit ledger. The Session-frozen Persona prompt remains unchanged after a branch switch until a new Session takes its snapshot.

Memory file queries exclude the repository's `.git` control directory and reject filesystem paths that escape the Memory root, including symlink escapes. The Host may list binary files but does not render or edit them as text. These UI and access safeguards do not restrict what Git may store in the repository. Explicit Human text edits use optimistic HEAD checks and make a Git commit; legacy structured Markdown writing keeps its narrower path contract.

## Consequences

This supersedes the accepted-commit authority, Markdown-only file validation, linear-history requirement, raw-branch admission gate, and automatic repair requirement in ADR-0047 and #115. Existing checkpoint and repair records remain readable for compatibility. Recovery actions that change Git state remain explicit and preserve the original repository when archiving; no service silently rewrites native Git history. Git graph displays all local branch history and identifies observed checkpoints without implying that other commits are not Memory.

The first tracer proves native fetch/reset of an unrelated merged repository, immediate file and graph visibility, a same-Session branch switch and read, and Host restart consistency. Broader recovery and audit presentation remain tracked by #115.
