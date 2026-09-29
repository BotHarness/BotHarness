#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineOf, compareBaseline, scanRepository } from './source-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts/source-policy-baseline.json');
const mode = process.argv[2];

function writeBaseline(issues) {
  const baseline = {
    version: 1,
    entries: baselineOf(issues),
  };
  const entries = baseline.entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n');
  writeFileSync(baselinePath, `{\n  "version": 1,\n  "entries": [\n${entries}\n  ]\n}\n`);
  console.log(
    `source policy: wrote ${baseline.entries.length} baseline entries for ${issues.length} violations`,
  );
}

function describe(item) {
  return `${item.path}:${item.line}:${item.column} ${item.kind}: ${item.token.replace(/\s+/g, ' ').slice(0, 100)}`;
}

try {
  const issues = await scanRepository(root);
  if (mode === '--init-baseline') {
    if (existsSync(baselinePath))
      throw new Error('baseline already exists; use --prune-baseline after removing violations');
    writeBaseline(issues);
  } else {
    if (!existsSync(baselinePath)) throw new Error('missing source-policy baseline');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (baseline.version !== 1 || !Array.isArray(baseline.entries))
      throw new Error('unsupported baseline format');
    const { unexpected, stale } = compareBaseline(issues, baseline.entries);
    if (unexpected.length) {
      console.error(
        'New code comments or React useEffect calls are prohibited by docs/agents/source-policy.md:',
      );
      for (const item of unexpected) console.error(describe(item));
      process.exitCode = 1;
    } else if (mode === '--prune-baseline') {
      writeBaseline(issues);
    } else if (mode) {
      throw new Error(`unknown option: ${mode}`);
    } else if (stale.length) {
      console.error(
        `source policy: ${stale.length} baseline entries are stale; run node scripts/check-source-policy.mjs --prune-baseline`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `source policy: ${issues.length} existing violations match the reviewable baseline; no new violations`,
      );
    }
  }
} catch (error) {
  console.error(`source policy: ${error.message}`);
  process.exitCode = 1;
}
