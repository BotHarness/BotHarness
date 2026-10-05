# Preparing the first npm prerelease

This is the operator path for #866, following the packaged qualification in
[#823](https://github.com/BotHarness/BotHarness/issues/823) and the real Lark onboarding
in [#824](https://github.com/BotHarness/BotHarness/issues/824). Preparation produces
reviewable artifacts; it does not publish a release or deploy the website.

## Proposed first release

Review `0.1.0-alpha.1` under npm dist-tag `next`. The version is a proposal until
Human release approval. Publish these precompiled packages in this order:

1. `@botharness/im-provider@4.32.0-botharness.4` — independent Provider version;
2. `@botharness/core@0.1.0-alpha.1`;
3. `@botharness/ui@0.1.0-alpha.1`;
4. `deepseekbot@0.1.0-alpha.1` — one product Bundle with exact dependencies.

Computer and Browser are optional separate Bundles and are not published by this
first product workflow. Keep the qualified Provider source pinned; merged upstream
PRs do not qualify an upstream replacement. DSH support remains `0.2.0-rc.1`.

The source packages stay private/0.0.0. The existing product packer creates public
release manifests and precompiled entries in a separate staging directory. It
keeps MIT licenses, Provider attribution and `PROVENANCE.json`. No installed
account, credential, Binding or Service Grant is shipped in a package.

## Stable releases

`0.1.0-alpha.1` is published. The same workflows now also release a stable SemVer such
as `1.0.0`: the plan records dist-tag `latest` for a stable version and `next` for an
alpha, beta or RC version, and the publisher requires the literal confirmation
`publish <version> to <tag>` (for example `publish 1.0.0 to latest`). After a stable
publication it also moves `next` on Core, Client and the product to the same version,
so `deepseekbot@next` never lags behind `deepseekbot`. The Provider keeps its own
independent version and is skipped when its exact bytes already exist.

## Prepare without credentials

Use the **npm prerelease preparation** workflow manually from main. Enter the
agreed prerelease version. It checks/builds the exact revision, downloads the
immutable Provider source, verifies input digests and generates four tarballs.
PR runs for release-related changes prepare a unique `0.1.0-alpha.1-preview.<PR>.<run>`
version so they do not collide with immutable public packages; they cannot be used
as a publication source.

Download `npm-prerelease-<version>` and review `release-plan.json`, `artifacts.json`
and the four tarballs. Record preparation run ID, current-main source SHA, version
and the plan SHA-256 printed in the run summary. The plan binds source/DSH/Provider
revisions, publication order and the inventory digest; the inventory binds each
tarball's SHA-512. The verifier checks packed manifests, exact internal dependencies,
entrypoints, native Bundle Patch, Provider provenance and registry dependencies.
All four packages pass `npm publish --dry-run --ignore-scripts` without a token.
A local dirty preparation is labelled and cannot be published.

For a local rehearsal after installing the lockfile and building:

```sh
node scripts/npm-prerelease.mjs prepare --version 0.1.0-alpha.1 \
  --provider-source /path/to/qualified-provider --output /path/to/fresh-artifacts
node scripts/npm-prerelease.mjs verify --artifacts /path/to/fresh-artifacts
```

Use a fresh output directory. The Provider needs its lockfile dependencies installed
with scripts disabled; staging rebuilds the managed Host/Client entrypoints. Never
use an unrelated live Provider checkout or restart a shared receiver for packaging.

## Review before publication

Review the prepared artifacts and first-release scope, compatibility/upgrade risks,
release notes and any outstanding evidence limitations. #824's final added target
selector still lacks a final narrow/light/English recheck; earlier runtime captures
and automated checks do not replace that acceptance. Confirm the release version
and Human publication approval before dispatching the publisher.

BotUI's repository secret is not automatically shared with BotHarness. Supply
`NPM_TOKEN` to **BotHarness/BotHarness** through repository or explicitly authorized
organization-secret access. It must have publication rights to all four package
names, including the unscoped `deepseekbot`, and any required noninteractive 2FA
permission. The workflow cannot prove those rights from the secret's existence.
Keep token values in GitHub secret settings; never copy them into source, artifacts,
commands, logs or issue comments. Do not retrieve BotUI's local token file.

## Explicit publication and verification

After Human approval, dispatch **publish reviewed npm prerelease** from main with
the successful manual preparation run, source SHA, exact version, reviewed plan
SHA-256 and the literal confirmation `publish <version> to <tag>` (`latest` for a stable version, `next` for a prerelease). The source must
still be current main for a new publication; if main advanced, prepare and review a new run.
For an already started release, the explicit partial-recovery exception below retains the
original approved source and bytes instead of rebuilding an immutable version.

The publisher checks the run's workflow identity, event, branch, conclusion and SHA,
downloads its artifacts, then verifies/dry-runs them without publish credentials.
Only the final publishing step receives `NPM_TOKEN`. There is no rebuild and no
push/tag/merge-triggered publish. Dependencies publish before the product, with
public access and the planned dist-tag. Registry integrity is read back after
each send. A network or permission failure stops the run rather than blindly
repeating an ambiguous publication.

Before declaring the prerelease usable, independently verify all four versions,
integrities and `next` tags on npm. Install the published product in a fresh isolated
DSH Profile through native `dsh plugin --profile <name> add deepseekbot@<version>`;
verify one Provider and the real Client, disconnected initial state, usable model,
and the authorized Lark receipt/reply path. This **public-registry install** is still
a future verification; earlier local tarball substitutions do not prove it.

Record the public artifact/qualification and release announcement in the bilingual
Release Ledger following [the release rules](agents/changelog.md). Keep `Unreleased`
until a concrete release is approved; tag/GitHub Release publication is separately
authorized, and prerelease ledger evidence must point to its real tag and downloadable
artifact. This workflow does not create a tag/GitHub Release or deploy the website.

## Partial publication and recovery

When main advances after a release has partly published, dispatch the same publisher from
current main with `resume_partial=true` and the original approved preparation run, source,
version, plan digest and confirmation. This requires a successful manual-main preparation
whose source is an ancestor of current main, a clean original plan, and at least one already
published Core, Client or product package with exactly matching SHA-512. An independently
reused Provider alone does not establish a partial product release. Every existing version
must match; unavailable registry evidence or any byte conflict refuses recovery before the
publish credential is supplied. The workflow checks out the original reviewed source and
uses its verifier/publisher without rebuilding. Keep new main features for a later version.

npm publication is not atomic across packages. Preflight checks every existing
version and direct runtime dependency before the first publish. If interrupted,
inspect the registry before retrying with the same reviewed artifacts. An existing
version is skipped only when its exact integrity matches. Different bytes at that
version stop the entire run; choose a new reviewed version instead of overwriting.
The product is last so dependency publication failure cannot leave a newly published
product requiring missing internal versions. Verify tags separately before announcing;
a skipped matching version is not silently retagged or downgraded.

Code rollback uses the previously qualified product composition and approved Profile
backup procedure; a package revert cannot retract external sends or downgrade a
canonical database generation. Never delete account credentials/history to repair
installation. Remove conflicting standalone Provider/Core/Client Bundle layers before
enabling the product and stop the exact owning Host before switching artifacts.

References: [DSH Bundle publication](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish),
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/),
[BotUI release reference](https://github.com/BotHarness/BotUI/blob/dee41211aca0da71fe60206b5099283361fdb75a/scripts/release.mjs),
[product qualification](product-im-installation.md).
