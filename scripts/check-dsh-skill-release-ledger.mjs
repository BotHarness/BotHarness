#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateDshSkillReleaseLedgerPair } from './release-ledger.mjs';
import { readSkillProvenance } from './sync-skill.mjs';

const skillRoot = resolve('.agents/skills/dsh-plugin-dev');
const errors = validateDshSkillReleaseLedgerPair(
  readFileSync(resolve(skillRoot, 'CHANGELOG.md'), 'utf8'),
  readFileSync(resolve(skillRoot, 'CHANGELOG.zh.md'), 'utf8'),
  readSkillProvenance(),
);

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`${error.source} [${error.code}] ${error.message}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('DSH Skill Release Ledger is valid.\n');
}
