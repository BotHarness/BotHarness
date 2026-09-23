// Boot one isolated DSH dev instance for agent or human verification.
//
// Usage (from any worktree of this repo):
//   node scripts/dev-instance.mjs [--home <path>] [--port <port>] [--profile <name>]
//                                 [--worktree <path>] [--build] [--json]
//
// The helper owns the whole dev-loop ritual so agents never re-derive it:
//   profile from the web template → link this worktree's packages → install →
//   launch detached with the machine-local DeepSeek secret → wait for the
//   one-shot token URL → verify the plugin layer answers `/api`.
//
// Every instance is isolated by DSH_HOME and port, so worktrees, ports, and
// tokens can multiply without disturbing each other or a running VNC session.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  devSecretEnvironment,
  devSecretInstructions,
  profileDeepSeekCredential,
  resolveDevSecret,
} from './dev-secret.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {
    home: join(homedir(), '.dsh-botharness-dev'),
    port: 3080,
    profile: 'web-dev',
    worktree: repoRoot,
    build: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    switch (flag) {
      case '--home':
        options.home = resolve(next ?? '');
        index += 1;
        break;
      case '--port':
        options.port = Number.parseInt(next ?? '', 10);
        index += 1;
        break;
      case '--profile':
        options.profile = next ?? options.profile;
        index += 1;
        break;
      case '--worktree':
        options.worktree = resolve(next ?? '');
        index += 1;
        break;
      case '--build':
        options.build = true;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`unknown option: ${flag}`);
    }
  }
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error('--port must be a positive integer');
  }
  return options;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr?.trim() ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function ensureProfile(options) {
  const profileDir = join(options.home, 'profiles', options.profile);
  const manifestPath = join(profileDir, 'package.json');
  const env = { ...process.env, DSH_HOME: options.home };
  if (!existsSync(manifestPath)) {
    spawnSync(
      'dsh',
      ['--profile', options.profile, '--from-default-profile', 'web', '--dump-config'],
      {
        env,
        stdio: 'ignore',
      },
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const packages = join(options.worktree, 'packages');
  manifest.dependencies = {
    '@botharness/client': `link:${join(packages, 'client')}`,
    '@botharness/core': `link:${join(packages, 'core')}`,
    deepseekbot: `link:${join(packages, 'deepseekbot')}`,
  };
  manifest.dsh = {
    ...manifest.dsh,
    profile: {
      ...manifest.dsh?.profile,
      bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'deepseekbot'],
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run('pnpm', ['install'], { cwd: profileDir, stdio: 'ignore' });
  return profileDir;
}

function launch(options, profileDir) {
  if (options.build) {
    run('pnpm', ['build'], { cwd: options.worktree, stdio: 'ignore' });
  }
  const logPath = join(
    '/tmp',
    `dsh-${basename(options.home).replace(/[^a-zA-Z0-9-]/gu, '-')}-${options.port}.log`,
  );
  const env = { ...process.env, DSH_HOME: options.home, ...devSecretEnvironment() };
  // The child writes straight to the log fd: no pipes means this parent can
  // exit without holding the detached server open.
  const logFd = openSync(logPath, 'w');
  const child = spawn(
    'dsh',
    ['--profile', options.profile, '--port', String(options.port), '--no-open'],
    { env, cwd: options.worktree, detached: true, stdio: ['ignore', logFd, logFd] },
  );
  child.unref();
  return { child, logPath };
}

async function waitForToken(logPath, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  const pattern = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const match = pattern.exec(readFileSync(logPath, 'utf8'));
      if (match !== null) return match[0];
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`no token URL after ${timeoutMs}ms; see ${logPath}`);
}

async function verifyPluginLayer(url, options) {
  const [base, token] = url.split('/?token=');
  const jar = join('/tmp', `dsh-${basename(options.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`);
  await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const login = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const setCookie = login.headers.get('set-cookie');
  if (setCookie !== null) writeFileSync(jar, setCookie);
  const probe = await fetch(`${base}/api/settings/describe`, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(setCookie === null ? {} : { cookie: setCookie.split(';')[0] }),
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'dev-instance-probe',
      method: 'settings/describe',
      payload: { args: {} },
    }),
  });
  const text = await probe.text();
  return { status: probe.status, ok: probe.status === 200 && text.includes('server-response') };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const secret = resolveDevSecret();
  mkdirSync(options.home, { recursive: true });
  const profileDir = ensureProfile(options);
  const profileCredential = profileDeepSeekCredential(options.home) !== undefined;
  if (secret === undefined && !profileCredential) console.error(devSecretInstructions());
  const { logPath } = launch(options, profileDir);
  const url = await waitForToken(logPath);
  const health = await verifyPluginLayer(url, options);
  const summary = {
    url,
    log: logPath,
    home: options.home,
    worktree: options.worktree,
    secret:
      secret?.source ??
      (profileCredential
        ? 'DSH profile credentials (verify with a real model call)'
        : 'missing (model calls will fail)'),
    health,
    stop: `pkill -f "dsh --profile ${options.profile} --port ${options.port}"`,
  };
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`dev instance ready: ${url}`);
    console.log(`  DSH_HOME : ${summary.home}`);
    console.log(`  worktree : ${summary.worktree}`);
    console.log(`  secret   : ${summary.secret}`);
    console.log(`  plugin   : ${health.ok ? 'ready' : `unhealthy (HTTP ${health.status})`}`);
    console.log(`  log      : ${summary.log}`);
    console.log(`  stop     : ${summary.stop}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
