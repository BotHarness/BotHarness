#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateReleaseLedgerPair } from './release-ledger.mjs';

const englishPath = resolve(process.argv[2] ?? 'CHANGELOG.md');
const chinesePath = resolve(process.argv[3] ?? 'CHANGELOG.zh.md');
const errors = validateReleaseLedgerPair(
  readFileSync(englishPath, 'utf8'),
  readFileSync(chinesePath, 'utf8'),
);

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`${error.source} [${error.code}] ${error.message}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('DeepSeekBot Release Ledger is valid.\n');
}
