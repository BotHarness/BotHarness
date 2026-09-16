# Configuration and management UI lives inside DSH

The setup wizard, plugin settings, Bot management, memory editor, and diagnostics are a DSH settings-page surface; there is no standalone web console, public entry point, or domain. Ordinary users must reach a working Bot without editing config files or deploying anything.

## Considered Options

- **Standalone web admin** — rejected: extra deployment, auth surface, and hosting for no user benefit.
- **Config-file-only** — rejected as the primary path; a CLI fallback may cover headless hosts.
