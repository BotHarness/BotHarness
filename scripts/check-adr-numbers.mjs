#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? 'docs/adr');
const files = readdirSync(directory).filter((name) => /^\d{4}-[a-z0-9-]+\.md$/.test(name));
const seen = new Map();
const errors = [];
for (const file of files.sort()) {
  const number = file.slice(0, 4);
  if (seen.has(number)) {
    errors.push(`${file} duplicates ADR number ${number} (also ${seen.get(number)})`);
  } else {
    seen.set(number, file);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`docs/adr [duplicate-number] ${error}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`ADR numbers are unique (${seen.size} records).\n`);
}
