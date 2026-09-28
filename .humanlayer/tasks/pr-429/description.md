Closes #423

## Why the change

`engines.dsh` is declarative metadata that DSH does not enforce yet, so an exact host line forced a release-shaped change on every DSH RC; the four workspace packages now declare a verified-floor SemVer range instead.

## Special things to note

- Merge risk: **two-way door** — revert this commit; **small blast radius** — manifest metadata, one contract test, an ADR, and the ledger. No runtime behavior changes; the only dependency addition is `semver` for the test. Review focus: the chosen range and its semver semantics.
- The range `>=0.2.0-rc.1 <0.3.0-0` matches `0.2.0-rc.1`/`rc.2`/stable and later 0.2.x stables, excludes 0.1.x (0.1.5 crashed Bot mode, dsh-dev pitfall #19b) and 0.3.x; a future `0.2.1-rc.1` needs its floor bumped explicitly because prerelease tuples require a comparator with the same tuple.
- `devDependencies` and `peerDependencies` stay exact on purpose: the former is the build/type/test baseline, the latter describes the profile-supplied instance and is not validated by profile resolution.

## Change outline

```diff
 packages/{core,client,computer,deepseekbot}/package.json
-  engines.dsh: "0.2.0-rc.1"
+  engines.dsh: ">=0.2.0-rc.1 <0.3.0-0"
 package.json
+  devDependencies.semver: ^7.8.5   # for the manifest contract test
```

The contract test keeps the four manifests aligned and the floor honest:

```text
manifest-engines.test.mjs
  one shared range across core/client/computer/deepseekbot
  semver.minVersion(range) === pinned @deepseek-ai/dsh devDependency
  0.2.0-rc.1 | 0.2.0-rc.2 | 0.2.0 satisfy; 0.1.7-rc.2 and 0.3.0-rc.1 do not
```

ADR-0087 supersedes ADR-0022's exact-host-line reading for this field, and both ledgers carry one `Unreleased › Changed` entry.
