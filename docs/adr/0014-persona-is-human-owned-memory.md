# Persona is a human-owned memory file

A Bot's persona lives in its memory as `PERSONA.md`, free Markdown with a display name, so persona editing reuses the memory editor, git history, and export path. The memory tools refuse to write it: the Agent may revise its memories but never its own character; persona edits are human-only.

## Considered Options

- **Persona in DSH settings** — rejected: a second storage path for human-editable text, outside memory history and backup.
- **Agent-writable persona** — rejected: self-modifying character is unreviewed prompt-injection surface and makes behaviour shifts untraceable.
- **Base context-enhancement as persona** — rejected: semantic mismatch — per-chat context guidance, not identity.

## Consequences

- Persona changes are auditable in the memory git history like any other file.
- MEMORY.md loses its "persona summary" duty and becomes a generated index; persona injection reads `PERSONA.md` directly.
