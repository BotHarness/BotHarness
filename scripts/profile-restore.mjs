#!/usr/bin/env node
import { runProfileRestoreCli } from '../packages/core/dist/index.mjs';
try {
  await runProfileRestoreCli(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code ?? 'restore-failed', message: error.message }));
  process.exitCode = 1;
}
