# Release Ledger

`CHANGELOG.md` is the English canonical Release Ledger for DeepSeekBot.
`CHANGELOG.zh.md` is its maintained Chinese counterpart. Together they answer one question:
what observable difference will a user or DSH plugin developer find in a DeepSeekBot release?

Use `pnpm changelog:check` before review. The check validates objective structure and bilingual
parity; Human review owns notability, accuracy, and prose quality.

## Artifact boundaries

| Artifact                                  | Owns                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Release Ledger                            | The observable differences delivered by each DeepSeekBot release.                                            |
| GitHub Release                            | The release announcement derived from the ledger, plus optional Highlights, contributors, and the full diff. |
| ADR                                       | Why a durable architecture choice was made and which alternatives were rejected.                             |
| Context, architecture, and specifications | The current product language, relationships, and normative design.                                           |
| Issue and PR                              | The implementation plan, discussion, verification, and contributor provenance.                               |

Link to those artifacts instead of copying their detail into the Release Ledger.

## When to add an entry

Add a change to `Unreleased` when it affects a user or DSH plugin developer through one of these
branches:

- a feature, compatible behavior change, or bug fix;
- a breaking, deprecated, removed, or security-relevant behavior;
- reliability, security, performance, compatibility, or plugin developer experience;
- independently valuable public documentation, including a published architecture decision or
  contributor mental model.

Ordinary refactors, tests, dependency refreshes, CI changes, formatting, and implementation steps
stay in their Issue or PR. Record them only when their result crosses one of the branches above.
When one feature includes matching documentation, write one entry in the feature's section and
link the documentation. Use `Documentation` for a change whose delivered result is the public
documentation itself.

## Ledger shape

Keep `Unreleased` first. Archive it under a SemVer identity and ISO date only when that version is
released:

```markdown
## [Unreleased]

One sentence summarizing the next release for its readers.

### Added

- Added an observable capability and its value ([#123](https://github.com/BotHarness/BotHarness/issues/123)).

## [0.2.0] - 2026-10-01

One sentence summarizing the released version.
```

Use these sections when they contain entries:

- common: `Added`, `Changed`, `Fixed`, `Documentation`;
- conditional: `Breaking Changes`, `Deprecated`, `Removed`, `Security`.

Omit empty sections. Every change entry links at least one GitHub Issue or PR. Link user action to
the relevant guide and architecture rationale to its ADR. A change is normally one sentence and
may use a second sentence only for a migration, limitation, or required action. There is no fixed
word-count gate.

The ledger contains one migration-only `Development` section. It consolidates the implemented
work that predates the first release and is published as development history without a version.
Do not add another `Development` section, use it as a project-status state, or interpret it as a
tagged prerelease or installable artifact. All future public release entries use dated SemVer
sections; active and merged work stays in `Unreleased` and the Development status surface.

Describe the result before implementation detail:

```markdown
- Fixed duplicate Inbox Admission after provider retries, so a PersonaBot wakes once per Source Event ([#123](https://github.com/BotHarness/BotHarness/issues/123)).
```

Do not turn the ledger into a commit log:

```markdown
- Refactored three stores, added six tests, renamed two methods, updated schemas, and revised ADR-0041.
```

For a published design that has not changed runtime behavior, use documentation language:

```markdown
- Documented the provider-bound Trigger design; runtime behavior is unchanged ([ADR-0040](docs/adr/0040-personabot-export-wraps-soul-and-optional-operational-facets.md), [#123](https://github.com/BotHarness/BotHarness/issues/123)).
```

Use `Breaking Changes` to state the affected reader, old behavior, new behavior, and required
migration. Put lengthy steps in a migration guide. In the `0.x` line, compatible features and
breaking changes advance the minor version; compatible fixes and important documentation-only
releases advance the patch version. The first public version remains a release-scope decision.

## Bilingual parity

Update both ledgers in the same PR. Natural translation is expected; duplicated sentence structure
is not. Keep these facts identical and in the same order:

- release identity and date;
- section names and section order;
- every link target.

The validator deliberately does not compare translated prose. Keep section names in English in both
files so categories remain mechanically identical.

## Contribution and release flow

1. Add one result-focused bilingual entry to the matching `Unreleased` section and run
   `pnpm changelog:check`.
2. During the release PR, merge entries that describe one observable result, even when several PRs
   produced it. Preserve the necessary Issue and PR links.
3. Give the ledger release one summary sentence.
4. Derive the GitHub Release draft from that version, then add one to three Highlights when they
   genuinely help, followed by contributors and the full diff.
5. Obtain explicit Human publishing approval before creating a tag, publishing an artifact, or
   creating the GitHub Release.

Before release, remove an `Unreleased` entry whose change was fully reverted. After release, keep
history immutable and describe a restoration, withdrawal, or fix in the next version.
