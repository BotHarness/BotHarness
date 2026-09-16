# Build Bot memory in-house, file-first

DSH's existing memory plugins scope memory to a project or session, so none provides the Bot-level, cross-chat continuity this project is about. We build memory ourselves as plain Markdown files in a per-Bot directory: files are human-readable and editable, need no schema migrations, and match the customer-profile north-star scenario.

## Considered Options

- **Extend an existing DSH memory plugin** — rejected: wrong scope (project/session, not Bot).
- **SQLite** — rejected for memory: opaque, migration-heavy, not human-editable.
- **Vector store** — deferred until keyword search proves insufficient (PRD appendix D).

## Consequences

Memory layout, atomic writes, and tree-injection rules are ours to specify and enforce (PRD §5.5, rules M1–M10).
