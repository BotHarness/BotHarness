---
Status: Accepted
Date: 2026-10-10
Issues: [#1304](https://github.com/BotHarness/DeepSeekBot/issues/1304)
---

# Programmatic bot creation is a machine-first CLI over registry creation

Bot creation used to be UI-only: blank, from a zip, or from GitHub, all behind clicks in the Client. External coding agents already assemble DSH plus the DeepSeekBot plugin on their own machines; the next step of that Forge-style pipeline — minting a bot from a generated bundle, then installing and starting it — had no machine-callable surface. We decided that **programmatic bot creation is a `deepseekbot create` CLI that covers all three UI paths against any DSH_HOME with zero clicks, prints one JSON document to stdout (bot id, DM channel, data directory, per-step statuses, next actions), keeps human text on stderr, and is a thin layer over the same `PersonaBotRegistry` creation the UI uses — not a second creation path, not an HTTP API, and not MCP yet.**

## Decision

- **CLI first, same seam.** `runBotCreateCli` lives in `@botharness/core` next to the registry and wires a registry exactly like Host startup (operational database, memory git init, Git clone, descriptor sync). The `deepseekbot` package holds only a thin `deepseekbot.mjs` wrapper. MCP tools come after this path is proven; there is no HTTP API in this slice.
- **Stdout is the machine contract.** Success exits 0 with the bot id, DM channel id, memory data directory, step list, and next actions. Failure exits non-zero with `{"error": {"code", "message"}}` using stable codes (`bad-zip`, `bad-bundle`, `bad-ref`, `unknown-preset`, `unknown-bot`, plus the registry's own `git-clone-failed`, `git-clone-timeout`, `git-not-found`, `memory-unavailable`). Human-readable lines go to stderr only, so stdout stays parseable either way.
- **Names are labels, ids are identity.** Every create mints a fresh `bot-` UUID slug, so a duplicate name returns a second bot and still exits 0. There is no uniqueness gate.
- **Secrets never ride argv.** Any `--api-key` / `--token` / `--secret` / `--password` style flag is a hard `secret-in-argv` error, and the refusal message names only the flag, never its value. Model keys and tokens travel in the environment or a stdin pipe; result JSON never contains secret values because the CLI never interpolates them.
- **Missing models defer, not fail.** Without `--preset`, creation succeeds and the `model` step reports `no-model-yet`, pointing at Bot-mode Settings; model authorization stays a Settings task. An unknown `--preset` id fails before any bot is minted.
- **Small read verbs keep `next` honest.** `list` and `show` exist so the `next` actions in create output reference invokable commands, not future ones.

## Considered Options

- **HTTP API on the Host:** rejected. It adds auth, lifecycle, and versioning surface for a caller that already has local process access to the DSH_HOME the Host itself uses.
- **MCP tools first:** rejected. MCP rides on top of a proven creation path; proving the offline CLI first keeps the seam testable without a running Host.
- **Unique-name gate (`--unique-name`):** rejected. UI creation already treats the name as a label over a UUID slug; a pipeline that generates names would constantly collide with itself.
- **Secret-valued flags (`--api-key ...`):** rejected. Secrets in argv leak into shell history and process listings; env and stdin pipes carry them without touching the contract.
- **Second creation implementation bypassing the registry:** rejected. Bundle parsing (`readBotZip`), history restore, descriptor sync, and avatar/banner import already live behind `create` / `createFromGit` / `createFromFiles`; the CLI reuses them so UI and CLI imports stay identical.

## Consequences

- The stdout JSON shape and the error codes are a compatibility surface: later MCP tools wrap this path instead of reimplementing it, and changes to either need a ledger entry.
- Offline creation never opens DM channels or starts a runtime; DM channel ids are deterministic (`dm-<id>`), so the Host lazily materializes what the CLI reports.
- Private GitHub clones rely on the caller's existing git credential setup; the CLI passes the environment through and never invents its own credential flags.
- The user-facing contract lives in the bot CLI guide; the release ledger records the capability, not the flag list.
