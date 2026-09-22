// Resolve the machine-local DeepSeek API key for dev instances.
//
// Usage:
//   node scripts/dev-secret.mjs check      # report where the key comes from (never the value)
//   node scripts/dev-secret.mjs --export   # print `export DEEPSEEK_API_KEY=…` for eval
//   node scripts/dev-secret.mjs --print    # print the raw key for scripting
//
// Resolution order matches the DSH launch-environment precedence documented by
// `dsh-credentials-local`: $DEEPSEEK_API_KEY wins, then the machine-local dev
// secret file, then the macOS Keychain item `botharness-deepseek`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEV_ENV_PATH = join(homedir(), '.config', 'botharness', 'dev.env');
const KEYCHAIN_SERVICE = 'botharness-deepseek';

function fromEnvironment() {
  const value = process.env['DEEPSEEK_API_KEY']?.trim();
  return value === undefined || value.length === 0
    ? undefined
    : { source: '$DEEPSEEK_API_KEY', value };
}

function fromDevEnvFile() {
  if (!existsSync(DEV_ENV_PATH)) return undefined;
  const text = readFileSync(DEV_ENV_PATH, 'utf8');
  const match = /^[ \t]*export[ \t]+DEEPSEEK_API_KEY[ \t]*=[ \t]*(.+?)[ \t]*$/m.exec(text);
  const value = match?.[1]?.replace(/^["']|["']$/gu, '').trim();
  return value === undefined || value.length === 0 ? undefined : { source: DEV_ENV_PATH, value };
}

function fromKeychain() {
  if (process.platform !== 'darwin') return undefined;
  try {
    const value = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return value.length === 0 ? undefined : { source: `Keychain:${KEYCHAIN_SERVICE}`, value };
  } catch {
    return undefined;
  }
}

export function resolveDevSecret() {
  return fromEnvironment() ?? fromDevEnvFile() ?? fromKeychain();
}

/** Environment patch every dev instance launch should apply. */
export function devSecretEnvironment() {
  const resolved = resolveDevSecret();
  return resolved === undefined
    ? {}
    : { DEEPSEEK_API_KEY: resolved.value, DSH_DEV_SECRET_SOURCE: resolved.source };
}

export function devSecretInstructions() {
  return [
    'No DeepSeek API key found. Store one machine-locally (never in the repo):',
    `  security add-generic-password -U -a "$USER" -s ${KEYCHAIN_SERVICE} -w   # prompts without echo`,
    `  # or write ${DEV_ENV_PATH} yourself, e.g.`,
    `  #   export DEEPSEEK_API_KEY=sk-…`,
    'or export DEEPSEEK_API_KEY for a single run.',
  ].join('\n');
}

const invokedDirectly = process.argv[1]?.endsWith('dev-secret.mjs') === true;
if (invokedDirectly) {
  const mode = process.argv[2] ?? 'check';
  const resolved = resolveDevSecret();
  if (resolved === undefined) {
    console.error(devSecretInstructions());
    process.exit(1);
  }
  switch (mode) {
    case 'check':
      console.log(`DeepSeek API key: found in ${resolved.source} (${resolved.value.length} chars)`);
      break;
    case '--export':
      console.log(`export DEEPSEEK_API_KEY=${resolved.value}`);
      break;
    case '--print':
      console.log(resolved.value);
      break;
    default:
      console.error(`unknown mode: ${mode}`);
      process.exit(2);
  }
}
