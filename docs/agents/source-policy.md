# Source policy

Issue #448 establishes a baseline while existing code comments and React `useEffect()` calls are migrated. `pnpm lint` rejects additions. Issue #457 removes the baseline after all migration batches.

The checker parses first-party JS, JSX, TS, TSX, Astro, and CSS source in `packages/`, `scripts/`, `apps/docs/`, `design/`, and root source/config files. It reads tracked and non-ignored new files. Strings, regexes, template text, and JSX text are not comments. Standalone Markdown and MDX remain documentation and are outside this rule. Generated bundles under `packages/computer/lib/`, source maps, and minified files are excluded. Locked third-party skills under `.agents/` and their mirrors under `agent/` are outside first-party source.

The necessary exceptions are deliberately narrow:

- Node shebangs at line 1 of `scripts/` files.
- `// @vitest-environment jsdom` at line 1 of a test file.
- The exact `/* @vite-ignore */` in the Pagefind dynamic import. Removing it would change Vite's handling of that runtime URL.
- The existing ISC notice at the start of `packages/client/src/client/hash-icon.tsx`; the license requires the notice to accompany the vendored glyph.

Every non-exempt baseline entry records a path, kind, content fingerprint, count, example line, and preview. The checker fails on a new fingerprint or an increased count, and also fails when an entry becomes stale. After removing violations, run `node scripts/check-source-policy.mjs --prune-baseline` and include the reduced baseline in the same change. The initializer refuses to overwrite an existing baseline. A policy failure prints the exact source location; review the exception list before requesting a new one.

Docs-site contracts formerly held in code comments are in [Docs site maintenance contracts](docs-site-maintenance.md).

Computer runtime and interaction contracts formerly held in code comments are in [Computer runtime contracts](../architecture/computer-runtime-contracts.md).

In-harness Client lifecycle and interaction contracts formerly held in code comments are in [Client interaction contracts](../architecture/client-interaction-contracts.md).
