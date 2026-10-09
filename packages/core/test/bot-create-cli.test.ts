import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { createTempRoot } from './helpers.js';

interface Captured {
  code: number;
  stdout: string;
  stderr: string;
  json: any;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['DSH_HOME'];
  return env;
}

async function invoke(
  argv: string[],
  home: string,
  extraEnv: Record<string, string> = {},
  stdin = '',
): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runBotCreateCli(['--home', home, ...argv], {
    env: { ...baseEnv(), ...extraEnv },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readStdin: async () => stdin,
  });
  const stdout = out.join('\n');
  return { code, stdout, stderr: err.join('\n'), json: JSON.parse(stdout) };
}

function git(args: string[], cwd: string, env: Record<string, string> = {}): void {
  execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function seedBareRepo(root: string): string {
  const work = join(root, 'work');
  mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  mkdirSync(join(work, '.botharness'), { recursive: true });
  writeFileSync(
    join(work, '.botharness', 'bot.json'),
    JSON.stringify({ name: 'Seedling', tags: ['scout'], bio: 'grown from git' }),
  );
  writeFileSync(join(work, 'notes.md'), '# seed notes\n');
  git(['add', '-A'], work);
  git(
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'seed',
    ],
    work,
  );
  const bare = join(root, 'seed.git');
  git(['clone', '-q', '--bare', work, bare], root);
  return bare;
}

function withGitConfigEnv(bare: string, run: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  const rewrite = `${bare.replace(/seed\.git$/u, '')}`;
  const entries: Record<string, string> = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${rewrite}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/test/',
  };
  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

afterEach(() => {
  for (const key of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) {
    delete process.env[key];
  }
});

describe('deepseekbot create', () => {
  it('prints help without touching a home', async () => {
    const out: string[] = [];
    const code = await runBotCreateCli(['--help'], {
      env: baseEnv(),
      stdout: (text) => out.push(text),
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('deepseekbot create --name <name>');
  });

  it('creates a blank bot against a fresh home with zero clicks', async () => {
    const home = createTempRoot('botharness-create-blank-');
    const result = await invoke(['create', '--name', 'Ada'], home);
    expect(result.code).toBe(0);
    expect(result.json.bot.id).toMatch(/^bot-[0-9a-f]{32}$/u);
    expect(result.json.bot.name).toBe('Ada');
    expect(result.json.dm.channelId).toBe(`dm-${result.json.bot.id}`);
    expect(result.json.dataDir).toBe(
      join(home, 'botharness', 'bots', result.json.bot.id, 'memory'),
    );
    expect(existsSync(result.json.dataDir)).toBe(true);
    expect(result.json.steps.map((step: { name: string }) => step.name)).toEqual([
      'validate',
      'allocate-id',
      'create-bot',
      'model',
    ]);
    expect(result.json.steps.at(-1)).toMatchObject({ status: 'deferred', code: 'no-model-yet' });
    expect(result.json.next).toHaveLength(3);
    expect(result.stderr).toContain(result.json.bot.id);
  });

  it('mints a second bot for a duplicate name', async () => {
    const home = createTempRoot('botharness-create-dup-');
    const first = await invoke(['create', '--name', 'Same'], home);
    const second = await invoke(['create', '--name', 'Same'], home);
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(second.json.bot.id).not.toBe(first.json.bot.id);
    const listed = await invoke(['list'], home);
    expect(listed.code).toBe(0);
    expect(listed.json.bots.map((bot: { id: string }) => bot.id).sort()).toEqual(
      [first.json.bot.id, second.json.bot.id].sort(),
    );
  });

  it('fails fast on a secret in argv and never echoes it', async () => {
    const home = createTempRoot('botharness-create-secret-argv-');
    for (const secret of ['--api-key', '--token=sk-fake-2']) {
      const result = await invoke(['create', '--name', 'Ada', secret, 'sk-fake-1'], home);
      expect(result.code).toBe(2);
      expect(result.json.error.code).toBe('secret-in-argv');
      expect(result.stdout).not.toContain('sk-fake');
    }
  });

  it('accepts secrets via env and keeps them out of stdout JSON', async () => {
    const home = createTempRoot('botharness-create-secret-env-');
    const result = await invoke(['create', '--name', 'Env Bot'], home, {
      DEEPSEEK_API_KEY: 'sk-env-secret-9',
    });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('sk-env-secret-9');
  });

  it('reads the persona from stdin without echoing other env secrets', async () => {
    const home = createTempRoot('botharness-create-stdin-');
    const result = await invoke(
      ['create', '--name', 'Piped', '--persona-stdin'],
      home,
      {},
      'You are a scout.',
    );
    expect(result.code).toBe(0);
    expect(readFileSync(join(result.json.dataDir, 'SOUL.md'), 'utf8')).toBe('You are a scout.');
  });

  it('rejects a missing name and mixed sources as usage errors', async () => {
    const home = createTempRoot('botharness-create-usage-');
    const missing = await invoke(['create'], home);
    expect(missing.code).toBe(2);
    expect(missing.json.error.code).toBe('usage');
    const mixed = await invoke(
      ['create', '--name', 'Ada', '--from-zip', 'a.zip', '--from-git', 'o/r'],
      home,
    );
    expect(mixed.code).toBe(2);
    expect(mixed.json.error.code).toBe('usage');
  });

  it('refuses a damaged zip and a missing zip with bad-zip', async () => {
    const home = createTempRoot('botharness-create-badzip-');
    const damaged = join(home, 'damaged.zip');
    writeFileSync(damaged, 'not a zip at all');
    const first = await invoke(['create', '--from-zip', damaged], home);
    expect(first.code).toBe(1);
    expect(first.json.error.code).toBe('bad-zip');
    const missing = await invoke(['create', '--from-zip', join(home, 'absent.zip')], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('bad-zip');
  });

  it('imports a bot bundle zip and honors an explicit name override', async () => {
    const home = createTempRoot('botharness-create-zip-');
    const archive = join(home, 'bot.zip');
    writeFileSync(
      archive,
      writeZip([
        {
          path: '.botharness/bot.json',
          data: Buffer.from(JSON.stringify({ name: 'Zippy', tags: ['scout'], bio: 'from zip' })),
        },
        { path: 'notes.md', data: Buffer.from('# memory\n') },
      ]),
    );
    const imported = await invoke(['create', '--from-zip', archive], home);
    expect(imported.code).toBe(0);
    expect(imported.json.bot.name).toBe('Zippy');
    expect(existsSync(join(imported.json.dataDir, 'notes.md'))).toBe(true);
    const renamed = await invoke(['create', '--name', 'Override', '--from-zip', archive], home);
    expect(renamed.code).toBe(0);
    expect(renamed.json.bot.name).toBe('Override');
  });

  it('imports a bot bundle directory and rejects an empty one', async () => {
    const home = createTempRoot('botharness-create-dir-');
    const bundle = join(home, 'bundle');
    mkdirSync(join(bundle, '.botharness'), { recursive: true });
    writeFileSync(
      join(bundle, '.botharness', 'bot.json'),
      JSON.stringify({ name: 'Dirling', tags: ['scout'] }),
    );
    writeFileSync(join(bundle, 'notes.md'), '# memory\n');
    const imported = await invoke(['create', '--from-dir', bundle], home);
    expect(imported.code).toBe(0);
    expect(imported.json.bot.name).toBe('Dirling');
    const empty = join(home, 'empty');
    mkdirSync(empty, { recursive: true });
    const refused = await invoke(['create', '--from-dir', empty], home);
    expect(refused.code).toBe(1);
    expect(refused.json.error.code).toBe('bad-bundle');
  });

  it('rejects a malformed git ref without touching the network', async () => {
    const home = createTempRoot('botharness-create-badref-');
    const result = await invoke(['create', '--name', 'Ada', '--from-git', 'not a url!!!'], home);
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('bad-ref');
  });

  it('reports an unreachable git remote with a coded error', async () => {
    const home = createTempRoot('botharness-create-unreachable-');
    const result = await invoke(
      ['create', '--name', 'Ada', '--from-git', 'https://127.0.0.1:9/nope.git'],
      home,
    );
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('git-clone-failed');
  });

  it('clones a GitHub shorthand ref through a local rewrite', async () => {
    const home = createTempRoot('botharness-create-git-');
    const root = createTempRoot('botharness-create-seed-');
    const bare = seedBareRepo(root);
    void bare;
    let result: Captured | undefined;
    await withGitConfigEnv(join(root, 'seed.git'), async () => {
      result = await invoke(['create', '--name', 'GitBot', '--from-git', 'test/seed'], home);
    });
    expect(result?.code).toBe(0);
    expect(result?.json.bot.name).toBe('GitBot');
    expect(existsSync(join(result?.json.dataDir as string, 'notes.md'))).toBe(true);
  });

  it('applies a model preset and reports an unknown preset without minting', async () => {
    const home = createTempRoot('botharness-create-preset-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let presetId = '';
    try {
      const presets = createModelPresetStore({
        rootDir: join(home, 'botharness'),
        database: owner,
      });
      presetId = presets.create({
        name: 'Scout',
        orchestrator: { provider: 'deepseek', model: 'deepseek-chat' },
        assignmentDefault: { provider: 'deepseek', model: 'deepseek-chat' },
      }).id;
    } finally {
      owner.close();
    }
    const applied = await invoke(['create', '--name', 'Preset Bot', '--preset', presetId], home);
    expect(applied.code).toBe(0);
    expect(applied.json.steps.at(-1)).toMatchObject({ name: 'model', status: 'ok' });
    const unknown = await invoke(['create', '--name', 'Nope', '--preset', 'absent'], home);
    expect(unknown.code).toBe(1);
    expect(unknown.json.error.code).toBe('unknown-preset');
    const listed = await invoke(['list'], home);
    expect(listed.json.bots.map((bot: { name: string }) => bot.name)).toEqual(['Preset Bot']);
  });

  it('shows a bot and reports an unknown id', async () => {
    const home = createTempRoot('botharness-create-show-');
    const created = await invoke(['create', '--name', 'Ada'], home);
    const shown = await invoke(['show', created.json.bot.id], home);
    expect(shown.code).toBe(0);
    expect(shown.json.bot).toMatchObject({ id: created.json.bot.id, name: 'Ada' });
    expect(shown.json.dm.channelId).toBe(`dm-${created.json.bot.id}`);
    expect(shown.json.dataDir).toBe(created.json.dataDir);
    const missing = await invoke(['show', 'bot-absent'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-bot');
  });
});
