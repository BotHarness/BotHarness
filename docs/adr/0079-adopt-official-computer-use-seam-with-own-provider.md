---
Status: Accepted
Date: 2026-09-28
---

# Adopt the official computer-use seam with a BotHarness-owned provider

BotHarness composes the official `@deepseek-ai/dsh-computer-use` service and registers exactly one provider from `@botharness/computer` under the name `botharness-computer`. The official experimental provider packages are not adopted. The existing application-defined Computer Service stays: it owns the Human-visible lifecycle (probe, start, stop, viewer, export/import), while the official seam owns tool-provider registration. The two are distinct terms: **Computer Provider** runs the Computer; **Computer Tool Provider** supplies the tools PersonaBots use on it.

The Computer Tool Provider owns the whole integration. It connects to a pinned Cua Driver inside the Computer container over stdio MCP (`docker exec -i … cua-driver mcp`), exposes a curated observe/act/verify core of the driver's catalog, and keeps the rest reachable through progressive discovery (search/describe) instead of loading the catalog into prompts. The driver is pinned by version and checksum, installed outside `/config`, telemetry and update checks are disabled, and it runs as the container's desktop user; the container image is pinned by digest. The long-term supply shape is a derived image that bakes the desktop stack and the driver.

The Tool Provider never depends on the container being up when the Host starts: a stopped Computer is a tool-call error the model reports to the Human, never an activation failure. Guidance is registered as a PersonaBot-scope prompt section at the official `TOOL_COMPUTER_USE` order, and tools are registered only in the session scopes of PersonaBots whose Computer Access is on (ADR-0080).

## Why

- The official seam fixes the registration contract — one exclusive provider, no unified action API, no Session broker — so our Consumers (tools, panels, routing) stay stable if DSH evolves. DSH deliberately leaves observation/action workflow, ownership, and Human interaction to the caller, which is exactly the part BotHarness owns.
- Shipping an experimental provider package would put an experimental dependency and a fixed, globally visible tool catalog into every distribution, against the zero-configuration and stability goals for users. The spike also measured that its initial activation failure is terminal for the Host run (`entry did not activate`, restart required) while our provider must degrade to a clear tool error.
- Neither official provider fits the container: the native one drives the machine running DSH itself (and a crash can take the Host process with it); the MCP one spawns on the Host and cannot express per-PersonaBot access because its tools are global.
- Tool surface: the driver's full catalog is large and full of near-synonyms; the Cloudflare Code Mode guidance (small fixed tool sets for direct calls, progressive discovery for large catalogs) matches our constraints — curated core, discoverable expansion, never prompt-dumping.

## Considered options

- **Official `cua-driver-mcp` provider in the product** — rejected: experimental dependency, global unfilterable tool catalog, terminal activation failure.
- **Official `cua-driver-native` provider** — rejected: same-process SDK drives the Host machine, not the container; crash blast radius reaches the Host.
- **Keep only the application-defined seam** — rejected: the official seam exists at our pinned version; deferring migration loses the reserved prompt order and contract for no benefit.
- **`cua-driver call` per action** — rejected: per-call process spawn inflates latency and loses session continuity.
- **Expose the whole 60-tool catalog** — rejected: prompt cost and selection accuracy; a curated core with progressive discovery is the recorded expansion path.

## Consequences

- ADR-0050's application-defined seam is superseded in part: the Computer Service remains, the computer-use registration moves to the official seam.
- Driver pinning, license notices, telemetry defaults, and the checksum-verified install path become maintenance obligations of `@botharness/computer`; the derived-image bake-in is the recorded follow-up.
- Provider lifecycle must keep Host boot independent of the container; the stopped-container path is a tested tool error.
- If DSH changes the seam, only this provider's registration and tool wiring change; Consumers (tools, guidance, panels, audit) stay.
