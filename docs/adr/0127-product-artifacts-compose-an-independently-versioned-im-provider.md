---
Status: Proposed
Date: 2026-10-05
---

# Product artifacts compose an independently versioned IM Provider

The release artifact for the DeepSeekBot product carries exact Core, Client and
`@botharness/im-provider` dependencies and activates all three through one DSH
Bundle Patch. The source workspace remains private and uses its existing
development Patch; packing a release does not publish it or enable any account.
This extends ADR-0104's development-only fork policy for qualified product
distribution after review and Human acceptance of #823. It does not declare that
ADR-0101's gate was satisfied by the earlier development qualification.

## Provider ownership and qualification

The Provider remains a separate package and version train. It retains dsh-im's
MIT license, attribution, SDKs, credentials, account storage, settings and
connection lifecycle. BotHarness Core still consumes its public same-Host
Service; Binding, Service Grant, Source Event, Inbox Admission and Outbox remain
application-defined facts owned by BotHarness. Package composition grants no
access and creates no connected account.

The first input is the compiled maintained fork at
[`a0227c44d8aa217361a890f79990a5c47edd6b55`](https://github.com/DoodleBears/dsh-im/commit/a0227c44d8aa217361a890f79990a5c47edd6b55),
on DSH `0.2.0-rc.1`. The builder checks the fixed runtime, package manifest and
build lock digests before staging. It changes the package/Client registration
identity and replaces standalone update controls with product-managed updates;
the checked account, exclusive Consumer, conditional send, history and attachment
contracts remain intact. `PROVENANCE.json` records input, managed source hashes
and rebuilt runtime digest. The product artifact inventory records each tarball's
SHA-512 integrity. Neither an unchanged upstream version string nor a successful
package install substitutes for a real qualified Host and model round trip.

Provider `4.32.0-botharness.1` is independently versioned; a change to its shipped
code requires another Provider version and deliberate requalification. The
Provider cannot update itself to the incompatible upstream npm package. Reusable
contract improvements should still be proposed upstream; a merged upstream PR is
not proof of a released compatible artifact. Replace the maintained Provider only
after qualifying the replacement on the supported DSH revision.

## Activation and retained state

Only the product is selected in `dsh.profile.bundles`. The Provider retains its
existing Loader entry ID `xmanrui-dsh-im`, RPC namespace and storage identity so
stored credentials and account configuration are not renamed. A separately
enabled Provider or Core/Client Bundle conflicts with this composition; remove
that separate Bundle entry before enabling the product. The qualification
installer refuses the conflict before boot and checks the entire native composed
Patch, including nested entries and Profile overrides. Do not rely on duplicate
Loader IDs as a refusal: this pinned Loader can collapse duplicates to the last
entry. Direct native installation must first remove conflicting Bundle entries. Do not delete credentials, history or Grants
as an installation repair. Stop the exact owning Host before switching artifacts;
only one receiver can own an account. Revalidate retained authority and never
backfill remote history or retry an unknown external effect on upgrade.

The packaged verification path uses an independently installed official CLI.
DSH resolves Bundles from its installation before the Profile, so the development
CLI inside this monorepo can select linked source instead of installed tarballs.
The helper checks the installed packages and Provider runtime, then the actual
Client must display the product test version and three running components.
pnpm 12 artifact overrides live in `pnpm-workspace.yaml`; unrelated settings and
build decisions survive. These local artifact substitutions test not-yet-published
release packages and do not represent an npm release.

## Rollback and boundaries

Before changing a retained Profile, back up its private state with the owning
Human's approved procedure. Stop its Host, remove the product layer and restore
the previously qualified composition to roll back code; do not downgrade canonical
database generations without their established recovery path. Already accepted
external sends cannot be undone by reverting a package. This decision introduces
no database migration, account sharing, authorization exception or second store.

The existing Client configuration is used for this slice. Resumable first-time
Lark application setup and a guided UI remain #824; it must use real platform
operations. Installing the Provider does not qualify every SDK platform it ships.
Merging, public registry publication and deployment remain independent Human
actions.

## References

- [#822 specification](https://github.com/BotHarness/BotHarness/issues/822),
  [#823 installation tracer](https://github.com/BotHarness/BotHarness/issues/823).
- [Packaging and qualification](../product-im-installation.md).
- [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md),
  [ADR-0104](0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md).
- [DSH Bundle publishing](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish).
