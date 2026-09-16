# Archive inbound chat files into the Bot workspace

Images and files uploaded in chats are archived into the Bot's workspace under an `attachments/` directory, and their local paths are injected into the turn's context; Memory entries reference them by relative path. Chat material — contracts, quotes, screenshots — is the primary input for the customer-follow-up scenario, so the Agent must be able to read, cite, and remember it.

## Consequences

Attachments are read, never executed outside the sandbox, and are subject to size/type limits (PRD rule M10, FR-13).
