---
Status: Accepted
Date: 2026-09-21
---

# Computer use is an optional standalone package mirroring the DSH provider seam

BotHarness gives a profile's PersonaBots one shared Linux desktop (the **Computer**) that a Human can watch and take over over VNC while a PersonaBot operates it through tools. Official DSH ships a computer-use subsystem (`ctx.computerUse`, single exclusive provider slot, plus experimental Cua Driver providers) only from `0.1.6-alpha.1`; BotHarness keeps its pinned `0.1.5-rc.2` baseline and delivers this capability as its own optional bundle.

## Decision

- Computer use ships as a **separate package with its own Bundle**, host half and client half, installed as an independent profile layer. It is not a member of the `deepseekbot` umbrella and a profile without it behaves exactly as before.
- The package provides an application-defined **Computer Service** shaped like the official seam: one exclusive Provider registration (a second registration fails), no unified action API, no Session broker, and a Provider-owned observation/action catalog. Workflow coordination stays with the caller.
- The v1 **Computer Provider** runs the Computer as a local Docker container — a Linux desktop with a browser, a persistent volume, and a web VNC endpoint. Replacing the Provider with a cloud or VM Execution World must not change Consumers.
- Bot-facing capabilities come from a pinned open-source driver inside the container, invoked through a resident process rather than per-call spawning; telemetry and update checks are disabled, and the driver sits behind the Computer Service so it can be replaced.
- The official provider packages are **not adopted** in this package. When DSH is deliberately bumped, migrating to `ctx.computerUse` must keep every Consumer unchanged; that bump is its own decision with its own verification.

## Considered Options

- **Bump DSH to `0.1.6-alpha.x` now** — rejected: the official subsystem is experimental, single-slot, and still leaves provider routing, Computer ownership, and the Human viewer to us; the bump would touch every package's `engines`/peer range and invalidate the current verification loop for no reduction in BotHarness work.
- **Build computer use inside `@botharness/core`** — rejected: it would force container runtime, image, and platform concerns on every profile and contradict the optional-capability shape of Memory and Channels.
- **Use the official MCP provider pointed at `docker exec`** — deferred: a promising spike, but it hard-couples us to an experimental package and an external executable's version on a DSH line we do not pin.
- **Define a unified screenshot/input action API** — rejected: no current Consumer needs portability across Providers, and translating provider-specific semantics would lose the observation vocabulary (window-scoped snapshots, element tokens, structured refusals, verification results).
- **One Provider slot per PersonaBot** — rejected: the slot is process-wide and a Computer is shared; ownership and routing belong to BotHarness, not to the registry.

## Consequences

- The build gains a second client bundle target; the package must pass the same bundle/manifest conformance and preflight checks as the others.
- A profile without the package keeps full Behaviour; the Computer Service reports unavailable rather than partially loading.
- The first tracer bullet proves a Human can see the Computer inside DSH; PersonaBot tools, Takeover, and profile-scoped ownership are later slices.
- Driver pinning, license notices, and telemetry defaults become maintenance obligations of this package.
- Migrating to the official seam later is a Provider-registration swap plus a DSH bump, not a Consumer rewrite.
