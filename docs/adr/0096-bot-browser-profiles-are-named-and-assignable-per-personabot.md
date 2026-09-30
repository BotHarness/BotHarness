---
Status: Accepted
Date: 2026-09-30
---

# Bot Browser profiles are named and assignable per PersonaBot

The default stays one shared **Bot Browser** profile: the Human signs in once and every PersonaBot reuses those logins. On top of that, a PersonaBot record may carry a **browser profile name** (letters, digits, dot, dash, underscore; up to 40 characters; empty means the default profile), and the Browser entry exposes a Profile field to change it. The entire names `.` and `..` are reserved path segments and are rejected before saving an assignment or resetting Bot work; dots within a valid name remain supported. Invalid stored names use the runtime’s existing default-profile fallback.

Each in-use profile runs its own browser instance with its own `--user-data-dir` — the default profile keeps `$DSH_HOME/botharness/browser`, named profiles live under `$DSH_HOME/botharness/browser-profiles/<name>`. Instances are created lazily on first use and idle-stop per profile, so only profiles actually in use consume the ADR-0083 memory budget. Tabs, Browser Access, authorization, pause, audit, and observation remain per PersonaBot; bots sharing a profile share its window and logins.

## Why

- Groups of PersonaBots sometimes need different identities or tenants while the common case must stay "sign in once, everyone works"; a named profile expresses both without a per-bot browser.
- One instance per in-use profile keeps the memory cost bounded and matches the existing single-instance idle policy.
- The profile is a PersonaBot-level assignment, like Browser Access, so the Human can reason about it per bot in the same surface.

## Considered options

- **Per-PersonaBot browser instances** — rejected: multiplies the ADR-0083 memory constraint and fragments the shared-login story.
- **A managed profile registry with caps and rename/delete flows** — deferred: the field is free-form today; directory cleanup and renaming stay manual and are recorded open questions.
- **Reusing the Human's daily browser profiles** — rejected independently by ADR-0089 (separate instance and profile are the boundary).

## Consequences

- A profile-name change resets that Bot's tab bookkeeping (its next action opens fresh tabs in the new profile); other Bots are unaffected.
- Concurrent non-idle profiles each carry a browser instance; the idle sweep stops them independently.
- Deleting or renaming a profile directory is out of scope for now; records keep pointing at the name.
