---
Status: Superseded in part by ADR-0037
---

# Archive inbound chat files into the Bot workspace

Images and files uploaded in chats are archived into the Bot's workspace under an `attachments/` directory, and their local paths are injected into the turn's context; Memory entries reference them by relative path. Chat material — contracts, quotes, screenshots — is the primary input for the customer-follow-up scenario, so the Agent must be able to read, cite, and remember it.

## Consequences

Attachments are read, never executed outside the sandbox, and are subject to size/type limits (PRD rule M10, FR-13).

## Update (2026-09-20)

A Source Event may be admitted to several PersonaBots or to none, so its attachment cannot canonically belong to one Bot workspace. Messaging attachments are now retained once in a profile-scoped content-addressed file store, with hash and metadata referenced by the authoritative Source Event in SQLite (ADR-0037). Provider URLs are ingress hints, not durable content, and attachment bytes are not SQLite BLOBs. A PersonaBot receives a safe readable reference and creates a separate Workspace or Memory copy only through an explicit preserve action. The sandbox and size/type requirements above remain in force.

An Attachment is physically garbage-collected only after no retained Source Event, Channel placement, Inbox Admission, Memory reference, or Workspace copy depends on it. Content Purge may remove an event's reference and then release the unshared blob; staged files that never committed are not retained content and may be collected independently.

## Update (2026-09-30)

[ADR-0100](0100-file-open-actions-target-real-host-files.md) supersedes the content-addressed attachment identity above with ordinary editable Host files. Independent uploads remain independent, messages refer to the current file, and external saves do not retain versions or generate message revisions or Bot wakes. The sender's upload source and explicitly preserved Memory or Workspace copies remain separate; reference-aware retention and explicit purge boundaries still apply. This target design requires migration from the current hash-addressed implementation.
