---
Status: Accepted
Date: 2026-10-01
---

# Attachments use native file operations under their trusted source authority

A Human may send arbitrary-format files, including ZIP archives. The owning Orchestrator acquires current bytes through the existing Attachment owner after source authorization, saves a separate working file into a Human-selected writable directory, and uses native file tools and approved Shell operations to process it. An explicitly selected result is imported as an independent Attachment and sent through canonical Messaging. BotHarness does not implement a universal document parser or another file catalog.

## Decision

ADR-0100 continues to own managed file identity and current contents. Source Event content and attachment references remain immutable. Current Channel membership and the exact message/file association authorize source acquisition; a fileId alone is not permission. Future Bridge sources resolve their trusted Source Event/target context, including Bot Inbox-only ingress without a fabricated Channel. Attention policy is not file authorization or permission to send elsewhere.

A Workspace Grant remains read-only for the Orchestrator unless the Human explicitly enables its durable `orchestratorWrite` permission. Memory remains the immutable Session cwd. Native file guards check current authorization; an application-defined isolated Policy Provider chooses exactly one current authorized root around each native `tools/execute` body. Public native Tool registrations reuse the preset's isolated fs/Shell Providers or the Host Providers when the preset inherits them. Neither the global Provider nor Session header is modified. Absolute project paths and Shell `workdir` identify the selected root. Shell retains Human approval/saved-rule behavior and executes in workspace-write; selecting a folder never grants Shell approval. Foreground Shell work keeps the slice's lifecycle bounded.

Write permission changes increment a durable revision used in approval-rule scope. Turning a permission off and on does not resurrect an older saved rule or pending approval. Revocation prevents future access; an already started Shell process may finish. Saved independent working files remain ordinary directory-owned files: leaving their source Channel prevents future source acquisition but does not erase the copies.

The first slice saves without overwriting an existing destination, streams through the existing byte limit/cancellation owner, and rechecks source and directory authority during transfer. Result import accepts a canonical regular file under current directory read authority, checks opened file identity and imports bytes with the existing Attachment owner. Success acknowledges only the completed operation; import does not itself send.

The #633 slice resolves `channel_attachment_open` from exact source association to one existing original. `read` grants native inspection; `edit-original` requires existing Human approval or a matching saved rule. A process-local selection owned by the runtime lasts for the current Orchestrator turn only, rechecks source authorization and file availability on every native call, and is cleared on settlement. Native file guards allow only that selected file; the isolated execution Policy uses its existing per-identity data directory for mutations, without granting sibling file paths, owner metadata or the attachment store. Approved opaque Shell keeps its existing semantics. No durable access table or second file catalog is created.

Explicit original writeback uses ordinary current-file semantics, with no application lock, compare-and-swap or history archive. The edit itself produces no Source Revision, file-change Inbox Admission or wake. Shared fileIds expose current contents after refresh/restart; separately generated results stay independent. Writing a profile-managed original does not automatically change an external provider's original file.

For subsequent Lark/Slack slices, metadata appears on receipt and authenticated provider download occurs on first access. Reuse existing adapter transfer capabilities, keep credentials Host-side, and validate both trusted ingress and checked outbound file replies. Current external text compatibility does not prove file support. Direct Assignment attachment acquisition is deferred.

## Alternatives

- A parser for every format — rejected: normal file tools/Shell already let the Agent choose the operation.
- Granting the attachment store or a common ancestor of writable directories — rejected: exposes unrelated files.
- Changing immutable Session cwd or using danger-full-access — rejected: loses Memory and execution boundaries.
- A global native Provider patch — rejected: affects other Agent Scopes and concurrent calls.
- Automatically overwriting received originals or external files — rejected: default work is save-as and independent return; original writeback is explicit.

## Verification and delivery

#632 is one local-conversation tracer: real model receives orders.zip, saves it in an explicitly writable work directory, reads the CSV, writes summary.csv/report.txt, repacks, imports and replies. Human download must prove three rows, quantity seven, total sixty, preserved original bytes and independent output identity. Permission denials, revocation, missing files, transfer limits/cancellation and failed sends remain separate observable outcomes. #633 verifies real-model original editing and downloads, shared identity, independent uploads, missing originals and revoked source access; external bridge tickets follow the first local slice and verified ingress.

Schema generation 42 adds default-off write permission and revision without replacing existing Grant rows. The Operational Database owner rejects older complete schema plans after activation: recover forward, or restore a separately retained pre-upgrade Profile backup; a code revert alone is not a downgrade.

## References

- [#631](https://github.com/BotHarness/BotHarness/issues/631), [#632](https://github.com/BotHarness/BotHarness/issues/632), [#633](https://github.com/BotHarness/BotHarness/issues/633).
- ADR-0100, ADR-0067, ADR-0041 and ADR-0038.
- Pinned DSH 0.2.0-rc.1 public Tool registration, Agent Scope, `agentPresets.serviceFor` and Sandbox Policy contracts; [Tools execution](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools).
