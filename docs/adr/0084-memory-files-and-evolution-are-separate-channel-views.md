---
Status: Accepted
Date: 2026-09-29
---

# Memory files and evolution use separate Channel views

## Context

The first Channel Memory entry combined a current-file list and inline editor with a Git graph. Selecting a commit already opens a full Channel-body diff (#260), while uncommitted changes appear only as a dirty marker. The Human wants to read current files and inspect external edits without having to commit them. ADR-0068 establishes the checked-out Git working tree as current Memory.

## Decision

A PersonaBot DM has two application-defined Channel sidebar entries:

- **Memory files** lists files from the checked-out Memory Repository. Selecting one opens its current content in the Channel body. Text is read-only in this surface; binary or oversized content gets a clear non-text result. The Human can use VS Code or another external tool to edit the repository.
- **Memory evolution** shows the native local Git graph. Selecting a commit opens its changed-file list and full-body diff. It also lists the current working tree's unstaged, staged, and untracked files separately. Selecting a working change opens a bounded full-body diff; an untracked text file is compared with an empty file. Binary changes are identified without being rendered as text.

Both views return to Chat without losing its unsent draft or reading position. Opening a view reads current repository state, and a visible Refresh action re-reads external changes. The Memory Service owns safe, bounded Git and file queries; the Client consumes them through the existing DSH Typert/API Gateway seam. Querying never stages or commits. Git remains the authority for current files and history; no second file or diff store is introduced.

## Consequences

The earlier inline text editor is removed from ordinary Memory navigation. This UI choice does not change the existing explicit Human save service contract or Git's own editing and commit capabilities. A working change can disappear or change between listing and selection; the query reports that stale selection rather than showing a diff for an unrelated state. Large and binary files degrade to a safe indicator. The existing commit diff behavior and branch operations remain part of Memory evolution.
