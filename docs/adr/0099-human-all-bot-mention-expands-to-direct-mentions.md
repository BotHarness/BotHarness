---
Status: Accepted
Date: 2026-09-30
---

# A Human's all-Bot Group mention expands to ordinary direct mentions

Only a Human may choose “@所有 Bot” in a Group Channel. At send time the Host resolves the active PersonaBots currently joined to that Channel, shows the recipient count to the Human, and commits one Channel Source Event with one explicit mention for each resolved Bot. Each recipient gets the same Inbox Admission, attention, and Wake Policy behavior it would get from being named individually. The shortcut does not create a broadcast source class, a second wake policy, membership, or permission to address Bots in other Channels. A PersonaBot cannot use the all-Bot shortcut.

The recipient set is derived from current trusted Channel membership, not from pasted text or a client-supplied list. If membership changes between preview and submission, the Host rejects that submission and returns the updated recipient count for a fresh Human send. A Channel with no eligible Bot recipients cannot send this mention. Ordinary per-Bot delivery and Bot-loop protections continue to apply after the single message commits.

## Why

The Human wants a faster way to address every Bot already present in one Channel. Treating the gesture as repeated direct mentions preserves the existing immediate attention semantics and makes its cost and reach visible. Letting Bots broadcast by default would multiply autonomous wake and reply loops without a Human request.

## Consequences

- Deliver this as a separate Messaging input slice (#542) linked from the Activity Center design, not as a special Human Inbox item.
- Preserve one human-facing unread Channel message even when several Bots receive separate Inbox Admissions and respond.
