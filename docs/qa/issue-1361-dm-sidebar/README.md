# Selected DM sidebar — issue #1361

Task: `codex/local/01a12665-4e4a-7542-9a58-5b054f452e33`.

## Root cause and boundary

Entering Bot mode opens the onboarding DM using a Channel-ID selection. The sidebar
previously inferred its registry scope, Bot identity and preference key only from
the selection discriminator, so this DM showed channel entries (Members only).
The shared sidebar context now resolves the selected DM from matching conversation
metadata or the roster, derives its PersonaBot scope, and rejects stale metadata.
It changes neither global selection semantics nor persistence, permissions or RPCs.

## Real browser evidence

Captured from the real isolated DSH 0.2.0-rc.1 runtime with the same disposable
Profile, welcome letter, English locale and dark theme. Measured viewport:
1402 × 877 CSS pixels; captured image: 1280 × 800 pixels. Images contain only
product-provided welcome copy and task-local test data.

- `before-dm.jpg`: base `3c378173a1c06b68983a81ede3afa13eef789b22`, first Bot-mode
  entry, tutorial explicitly skipped; selected DM but Members-only sidebar.
- `after-dm.jpg`: rebuilt Client, same selected DM and welcome letter; Memory files,
  Memory evolution, Sessions, Schedules, Model and the other PersonaBot entries.
- Leaving/re-entering Bot mode and reopening the DM retained the correct entries.
- Collapsing the DM sidebar, then opening the Bot Profile kept it collapsed.
- Expanding Memory files and switching between Profile and DM kept it expanded;
  `profile-shared-preferences.jpg` shows the native Profile view and expanded entry.
- `group-scope.jpg`: a group created through the native UI still shows Members,
  Wake policy, External connectors and Group management, not PersonaBot entries.
  This is unchanged-behavior regression evidence, not a changed-view comparison.
- Browser screenshot calls briefly failed for the group view; a later retry
  succeeded without changing browser systems or permissions.

No external IM messages, model runs, production changes or Browser/Computer access
enabling were performed. Desktop browser checks are not physical-phone QA.

## Automated checks

- Regression red: three assertions fail on the old implementation (DM scope,
  preference isolation and stale Channel metadata).
- Green: 136 tests across 15 files (sidebar, onboarding and Bot main view).
- Typecheck, lint/source-policy checks, build and bilingual release ledger pass.
- Scoped formatting and `git diff --check` pass.
- Full repository suite and Human QA are not claimed here.

## Human replay

1. Enter Bot mode and open the default welcome DM. Expect PersonaBot entries,
   not Members-only, without needing to open the Bot Profile first.
2. Collapse the sidebar, open the Profile, then reopen the DM: it stays collapsed.
3. Expand Memory files, switch between DM and Profile: expansion is shared.
4. Open a group: Members and group-management entries remain group-scoped.
5. Rapidly switch between a group and multiple Bots: entries must follow the
   current selection, never the previous conversation's metadata.
