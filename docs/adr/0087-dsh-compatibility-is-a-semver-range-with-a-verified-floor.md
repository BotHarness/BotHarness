---
Status: Accepted
Date: 2026-09-29
---

# DSH compatibility is a SemVer range whose floor is the verified host line

Every workspace package declares `engines.dsh` as `>=0.2.0-rc.1 <0.3.0-0`. The floor is the exact DSH version BotHarness verified — currently `0.2.0-rc.1`, the worktree devDependency and the version the local dev loop checks — and the ceiling keeps the declaration inside the 0.2 line so a future 0.3 breaking change must be adopted deliberately. DSH treats the field as declarative metadata today (`@deepseek-ai/dsh-package-manifest` types: "Compatible DSH versions as a SemVer range, including an exact version"; "DSH compatibility is declarative until a reader enforces it"), so the range is a claim for readers and for future enforcement, not a runtime gate. `devDependencies` stay exact because they are the build, type, and test baseline; `peerDependencies` stay exact because the profile supplies the instance, profile resolution does not validate ranges, and loosening them would change install-graph behavior without new verification.

## Why

- An exact host line reads as a hard pin and forced a release-shaped BotHarness change on every DSH RC even when nothing else moved; a range keeps the honest floor while covering later 0.2.x lines the same verification train adopts.
- 0.1.x cannot be the floor: 0.1.5 crashed Bot mode (dsh-dev pitfall #19b) and 0.1.7 → 0.2.0 carried Client UI behavior changes. A lower floor would claim combinations nobody verified.
- Prerelease semver needs an explicit comparator: `>=0.1.5` does not match `0.1.7-rc.2` at all, and a future `0.2.1-rc.1` needs its own floor bump because prerelease tuples only match a comparator with the same tuple.

## Considered options

- **Keep the exact host line (ADR-0022's reading)** — rejected: churn on every RC and misleading semantics for readers.
- **Floor only (`>=0.2.0-rc.1`)** — rejected: silently claims future majors.
- **Lower floor (`>=0.1.7-rc.2` or `>=0.1.5`)** — rejected: unverified cross-version claims; the 0.1.5 line is known-broken.
- **Loosen `peerDependencies` too** — deferred: peers describe the profile-supplied instance, profile resolution does not validate them, and changing them alters install-graph behavior without new verification.

## Consequences

- A DSH RC bump still updates the floor when the version tuple changes (for example `0.2.1-rc.1`), but stable 0.2.x releases no longer need a manifest change.
- A manifest contract test keeps the four packages aligned and anchors the floor to the pinned devDependency.
- If a reader starts enforcing `engines.dsh`, a profile on a verified 0.2.x line installs without a BotHarness release, while 0.3 stays blocked until adopted.
- Decision record: #423.
