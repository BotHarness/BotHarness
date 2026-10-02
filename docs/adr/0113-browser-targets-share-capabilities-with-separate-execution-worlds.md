# ADR-0113: Browser targets share capabilities with separate execution worlds

- Status: Accepted
- Date: 2026-10-03

## Context

The managed Bot Browser currently runs on the Host machine. Human requests an independent Container target without enabling Computer or sharing the daily browser profile (#725, #726). Browser observation, tab ownership, Session approval and Browser Audit already belong to the optional Browser Bundle.

## Decision

Browser Target is an application-defined Profile preference in the Browser Plugin's native volatile configForms scope. Local remains the default. The existing Browser runtime consumes an execution strategy: Local discovers or installs a managed browser, Container starts a digest-pinned official LinuxServer Chrome image. Both use the same CDP capability, Browser Tool Provider and native Session approval seam. Computer Target and resources remain independent.

Each Container profile uses an ownership-labelled named Docker volume and process derived from the Profile directory identity. Named profiles separate volumes; the default remains shared. Host directories only identify discoverable profile names and do not contain Container browser data. Startup is lazy, resources are bounded (2 CPUs, 2 GiB memory, 512 MiB shared memory, 1024 PIDs), idle-stop removes the owning process and preserves its volume. Restart uses a stable hostname and removes only Chrome Singleton artifacts in the verified volume after stopping its owner. Docker absence, foreign resource ownership and launch or disposal failure refuse explicitly.

Chrome CDP is internal to the container. A Host-loopback relay executes a bounded Docker-owned stream without publishing CDP. The Human viewer publishes only loopback and is served through DSH Web Host routes authenticated by Connection for HTTP and WebSocket. The shared application proxy forwards neither Host credentials nor cookies. Viewer routes and connected sockets are released with their runtime. Desktop sharing, clipboard, file transfer, commands, microphone and gamepad are disabled. There are no Host home, daily browser, Docker socket or Computer mounts.

Human Open reveals a native Modal with a read-only viewer. Explicit Enable Human interaction first pauses that Bot using the existing Browser Pause command; disabling interaction or closing the viewer preserves Pause. Resume remounts a read-only frame. Bots sharing a profile continue to follow the existing tab-visibility model; neither Docker nor per-Bot tab ownership separates Bots sharing that same profile.

Changing Browser Target increments a process-local authorization scope, revokes registrations and grants, clears refs and tab ownership, then waits for disposal before new execution. A pending native approval cannot authorize a different target. Failed disposal keeps the new execution barrier closed until a later successful switch. CDP transport closure rejects pending calls; requests time out without replaying actions. Human observation uses a single-flight Client poll so slow screenshots cannot occupy all HTTP connections.

Explicit browser_upload copies a regular Host file into bounded Container temporary storage (64 MiB per file, 128 MiB per runtime). Files remain until stop because file inputs may read bytes at later form submission; uploads never imply posting approval. Browser Audit continues to redact Host paths and text content.

## Consequences

Local and Container profile data stay separate when switching; this is not a profile migration. A code revert restores Local behavior after stopping owned Container resources, with no database migration. Container volumes remain for later reuse and explicit lifecycle management. Image pulls require Docker and network access. The image is pinned for reproducibility; updates require digest review and real QA.

The extension bridge for a Human's daily browser, profile export/backup, external CDP and remote Docker are separate slices. No second Browser permission, Session event store or Computer authority is introduced.

References: [#726](https://github.com/BotHarness/BotHarness/issues/726), [#725](https://github.com/BotHarness/BotHarness/issues/725), [ADR-0089](0089-browser-use-is-a-profile-scoped-managed-bot-browser.md).
