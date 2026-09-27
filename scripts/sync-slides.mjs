#!/usr/bin/env node
/**
 * sync-slides.mjs — build the presentations workspace and embed the static
 * output into the docs site.
 *
 * Source of truth: `apps/presentations/slides/<id>/index.tsx` (one deck per
 * folder; authoring rules live in `apps/presentations/AGENTS.md`).
 *
 * Generated output: `apps/docs/public/slides/`, served at
 * `botharness.ai/slides/`. That directory is gitignored and rebuilt by
 * `pnpm slides:build` — never hand-edit it.
 *
 * The deck is built with `OPEN_SLIDE_BASE=/slides/` so asset URLs resolve
 * under the docs subpath. Local iteration keeps base `/`:
 * `pnpm slides:dev` → http://localhost:5173/s/<id>.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = resolve(ROOT, 'apps', 'docs', 'public', 'slides');

rmSync(TARGET, { recursive: true, force: true });
execFileSync(
  'pnpm',
  [
    '--filter',
    '@botharness/presentations',
    'exec',
    'open-slide',
    'build',
    '--out-dir',
    TARGET,
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, OPEN_SLIDE_BASE: '/slides/' },
  },
);
console.log(`slides → ${TARGET}`);
