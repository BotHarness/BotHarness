# ADR-0124: Local Browser drivers share Host authority

- Status: Accepted
- Date: 2026-10-04
- Issue: [#767](https://github.com/BotHarness/BotHarness/issues/767)

## Context

The current Local Browser driver and agent-browser need a comparable PersonaBot trial before changing the default. A standalone CLI session would bypass the owning Browser Provider and cannot establish product behavior or authorization parity.

## Decision

The application-defined Browser Plugin selects an optional pinned agent-browser native driver below the existing Browser Provider. Local uses `current` by default. Container qualification remains [#768](https://github.com/BotHarness/BotHarness/issues/768); daily browser adapters keep their existing selection and authority.

The existing Local runtime owns Chrome discovery/install, its dedicated persistent browser profile, loopback CDP endpoint, visible Human window, uploads, screenshots and shutdown. The candidate attaches its owned native child only to that endpoint through a fresh private IPC directory. It does not invoke the CLI, join a default daemon, import personal profiles, or start another model loop. The bundled binary version must match the pinned package. Before attaching Chrome, the Host disables the native interactive stream, confirms its metadata is removed, and checks disabled status after attachment. Failure refuses startup and cleans up both processes. Native streaming is never published or connected to Client controls.

Tool Registrations remain in trusted Agent Scope. Browser Access, owning PersonaBot Session, native action approval, Bot Tab ownership, Browser Pause, Audit and native model attachments stay with the Provider. Computer authorization remains independent. Driver switching changes the native authorization scope, revokes in-flight and queued calls and waits for old runtime disposal; failed disposal blocks replacements and remains retryable through Human Stop.

The candidate serializes commands across all Bots sharing a browser profile and selects an exact CDP target ID. Native tab pinning prevents recovery into a neighbor. The native snapshot contributes read-only AX text. Its public refs omit backend identity and permit native role/name fallback, so they are never mapped into action handles. The existing DOM observer contributes the separate bounded nonce-stamped action handles and element metadata. A document nonce spans both reads; navigation or same-URL reload refuses the combined result and exposes no handles. Their cost is part of the candidate adapter measurement. Missing nodes and replaced documents refuse; role/name recovery never grants an action handle. Unstamped child-frame nodes remain read-only. Pause/Resume invalidates in-flight candidate observations and queued commands; a new observation is required before further input. Cancellation stops the owned native process and Chrome; already-issued input cannot be undone and is never automatically replayed.

## Consequences

The candidate is a trial option, not a qualified replacement. Full snapshots retain static page content; the shared DOM observer exposes at most 250 action refs, and the existing bounded observation contract applies. Snapshot size, latency and the additional DOM observation must be measured through the same PersonaBot/model/task protocol. Recorded token usage, character/byte counts and estimates are separate metrics. Platform binary availability does not prove cross-platform qualification. A failed model route or missing fixture read-back cannot be reported as a completed comparison.
