# #896 acceptance evidence

This records real, authenticated local DSH API and model execution on an isolated,
disposable Profile. It is backend E2E evidence, not rendered UI acceptance.

The model delivered `QA896_READY` through `channel_send`. Ordinary deletion retained
the Memory Git repository, uncommitted bytes, native Session ownership and Channel
history; subsequent resume and DM delivery were rejected. Explicit Memory erasure
removed only the selected disposable repository. A real Agent waiting for native
tool approval was stopped before deletion completed. After a cold Host restart,
all three identities remained deleted, their Memory outcomes and native history
were unchanged, and late input/resume remained rejected. Further real Host checks
refused a stale confirmation before persisting deletion, refused an escaping Memory
symlink while preserving outside bytes, and reported an injected filesystem
permission failure as incomplete. After a second cold restart, the incomplete
state still fenced execution; explicit retry completed the original erasure scope.
Custom/shared fixtures were created through the canonical Registry API with the
Host stopped and then verified through the authenticated running Host: a newly
created exclusive custom repository was erased, while a pre-existing unproven
root and two overlapping custom roots refused erasure and retained their bytes.

`backend-e2e.json` contains the checkpoints and opaque test identity/session IDs.
No authentication token or credentials are included.

## Reproduce backend checks

Build the branch and start an isolated Profile with `scripts/dev-instance.mjs`
using `--json`. Store that launch result in a machine-private file and pass its
path to `node docs/evidence/issue-896/host-e2e.mjs <private-launch-json>`.
The script creates and deletes only its own disposable Bots. Stop that exact Host
PID, restart the same Profile, and run
`node docs/evidence/issue-896/cold-e2e.mjs <fresh-private-launch-json>`.
It also leaves two active disposable Bots for Human UI review. Then run
`node docs/evidence/issue-896/failure-e2e.mjs <private-launch-json>`; restart the exact
Host again and run that script with `retry-after-cold-restart` as its final argument.
This temporarily changes permissions only on the new disposable Memory root and
restores its original permissions before exiting. For custom paths, stop that exact
Host and run `custom-host-e2e.mjs <private-launch-json> seed-stopped-profile` from
this directory, restart the same Profile, then run the script without that final
argument. It uses the built Core Registry API for fixture setup, not SQL edits or
a second store. All fixtures are newly created and disposable. Do not commit the
launch JSON, credentials or other private Profile contents.

## Windows UI review — 2026-10-08

The integrated branch was built and run in an isolated Windows Profile. A separate
checkout of main `006c0fa3d3cb690b1954338116f053c62620fdb6` supplied the baseline.
Both Profiles used an English Bot named `Deletion review`, with no activity and two
Memory commits. The baseline Profile has no deletion entry; the branch adds it
below Share and export. Light and dark screenshots are committed under
`docs/assets/pr/923-personabot-deletion/`.

Verified through the rendered Client:

- The confirmation identifies the Bot and exact Memory repository.
- Memory erasure starts unchecked, and the final action explicitly says retain Memory.
- Checking erasure changes both the scope explanation and final action label.
- Cancel leaves the Bot active; reopening resets the checkbox to unchecked.
- Opening Memory does not select erasure. Windows File Explorer opened the exact
  disposable Profile/Bot Memory directory, showing its `.git` and Memory files.
- The final action is readable in both themes using the shared danger-button tokens.

The final destructive actions were exercised through the real authenticated Host
API, including actual model execution and cold restart, rather than by clicking
the rendered confirmation. No separate Human sign-off is claimed. The injected
failure/retry and custom/shared-root refusal states have real Host evidence and
focused tests; rendered failure-state capture remains unavailable in this run.

The in-app browser did not apply the requested viewport override to the existing
rendered tab: baseline images are 1280 × 800 and confirmation images 876 × 821.
The theme, locale and selected Bot fixture match; images are original full-view
captures, without resizing or compositing. The dialog has no predecessor, so its
Before image intentionally shows the prior Profile entry point.

The integrated Host E2E was repeated after rebuilding, including a cold restart.
The local full Linux suite initially exposed a missing telemetry event, which was
fixed with lifecycle coverage. Source-policy setup was repaired in the snapshot;
remaining timing failures passed focused reruns with a bounded larger timeout.
Do not interpret those reruns as a single clean full-suite execution.
