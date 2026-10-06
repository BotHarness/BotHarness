import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { syncBotDescriptor } from '../src/bots/bot-descriptor-sync.js';
import { BOT_ZIP_MAX_BYTES, exportBotZip, readBotZip } from '../src/bots/bot-zip.js';
import { createBotZipHttp } from '../src/bots/bot-zip-http.js';
import { readZip, writeZip, ZipArchiveError } from '../src/bots/zip-archive.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTestRegistry } from './registry-fixture.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const LIMITS = { maxEntries: 100, maxTotalBytes: 1024 * 1024 };

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bot-zip-'));
  roots.push(root);
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function zipCodeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof ZipArchiveError) return error.code;
    throw error;
  }
  return undefined;
}

function registryAt(root: string) {
  return createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    syncDescriptor: (memoryDir, record, options) => syncBotDescriptor(memoryDir, record, options),
  });
}

function httpFor(registry: ReturnType<typeof registryAt>) {
  let next = 0;
  return createBotZipHttp({
    registry,
    createBotId: () => `zip-bot-${++next}`,
    detail: (slug) => {
      const record = registry.get(slug);
      return record === undefined
        ? { ok: false, error: { code: 'unknown-bot', message: slug } }
        : { ok: true, value: { bot: record } };
    },
  });
}

function importRequest(body: Uint8Array, name = 'Shared.zip', type = 'application/zip'): Request {
  return new Request(`http://host/api/botharness/bot-zip/import?${new URLSearchParams({ name })}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: new Uint8Array(body),
  });
}

describe('zip archive', () => {
  it('round-trips UTF-8 paths and binary content', () => {
    const archive = writeZip([
      { path: '笔记/会议.md', data: Buffer.from('# 会议\n'.repeat(200)) },
      { path: 'avatar.png', data: PNG },
    ]);
    expect(readZip(archive, LIMITS)).toEqual([
      { path: '笔记/会议.md', data: Buffer.from('# 会议\n'.repeat(200)) },
      { path: 'avatar.png', data: PNG },
    ]);
  });

  it('refuses traversal, absolute paths, symlinks, corrupt data and oversize archives', () => {
    for (const path of ['../evil.md', 'notes/../../evil.md', '/etc/passwd', 'C:/evil.md']) {
      const archive = writeZip([{ path, data: Buffer.from('x') }]);
      expect(zipCodeOf(() => readZip(archive, LIMITS))).toBe('unsafe-path');
    }

    const link = writeZip([{ path: 'link', data: Buffer.from('/etc/passwd') }]);
    const central = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    link.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    expect(zipCodeOf(() => readZip(link, LIMITS))).toBe('unsafe-path');

    expect(zipCodeOf(() => readZip(Buffer.from('not a zip at all, sorry'), LIMITS))).toBe(
      'invalid-zip',
    );

    const corrupt = writeZip([{ path: 'a.txt', data: Buffer.from('stored text') }]);
    corrupt.writeUInt8(corrupt.readUInt8(30 + 'a.txt'.length) ^ 0xff, 30 + 'a.txt'.length);
    expect(zipCodeOf(() => readZip(corrupt, LIMITS))).toBe('invalid-zip');

    const bomb = writeZip([{ path: 'big.txt', data: Buffer.alloc(2 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(zipCodeOf(() => readZip(bomb, LIMITS))).toBe('too-large');
  });
});

describe('Bot Zip export', () => {
  it('holds the working tree with uncommitted changes and never Git internals or ignored files', () => {
    const memoryDir = tempRoot();
    expect(ensureMemoryRepository({ memoryDir }).ok).toBe(true);
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Soul\n');
    writeFileSync(join(memoryDir, '.gitignore'), 'secret.env\n');
    git(memoryDir, 'add', '-A');
    git(memoryDir, 'commit', '-qm', 'seed');
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Soul, edited\n');
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex\n');
    writeFileSync(join(memoryDir, 'secret.env'), 'TOKEN=1\n');
    symlinkSync('/etc/hosts', join(memoryDir, 'hosts-link'));
    git(memoryDir, 'update-ref', 'refs/botharness/recovery/x', 'HEAD');

    const files = new Map(
      readZip(exportBotZip(memoryDir), LIMITS).map((entry) => [entry.path, entry.data.toString()]),
    );
    expect([...files.keys()].sort()).toEqual([
      '.gitattributes',
      '.gitignore',
      'SOUL.md',
      'people/alex.md',
    ]);
    expect(files.get('SOUL.md')).toBe('# Soul, edited\n');
    expect([...files.keys()].some((path) => path.startsWith('.git/'))).toBe(false);
  });
});

describe('Bot Zip file selection', () => {
  it('lists the files with sizes and marks bot.json and the avatar as always included', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada', persona: '# Ada\n', avatar: PNG_URL });
    const memoryDir = registry.memoryDirFor('ada')!;
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex\n');

    const response = await httpFor(registry)(
      new Request('http://host/api/botharness/bot-zip/files?slug=ada'),
    );
    expect(response.status).toBe(200);
    const listing = (await response.json()) as {
      files: Array<{ path: string; size: number }>;
      always: string[];
    };
    expect(listing.always).toEqual(['.botharness/bot.json', '.botharness/avatar.png']);
    expect(listing.files).toContainEqual({ path: 'people/alex.md', size: 5 });
    expect(listing.files.some((file) => file.path.startsWith('.git/'))).toBe(false);
  });

  it('exports exactly the selected files plus bot.json and the avatar', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada', persona: '# Ada\n', avatar: PNG_URL });
    const memoryDir = registry.memoryDirFor('ada')!;
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex\n');
    writeFileSync(join(memoryDir, 'people', 'sam.md'), 'Sam\n');
    writeFileSync(join(memoryDir, 'diary.md'), 'private\n');
    writeFileSync(join(root, 'outside.md'), 'outside\n');

    const response = await httpFor(registry)(
      new Request('http://host/api/botharness/bot-zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'ada',
          include: ['SOUL.md', 'people/alex.md', '.git/config', '../../outside.md', 'missing.md'],
        }),
      }),
    );
    expect(response.status).toBe(200);
    const entries = readZip(Buffer.from(await response.arrayBuffer()), LIMITS);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      '.botharness/avatar.png',
      '.botharness/bot.json',
      'SOUL.md',
      'people/alex.md',
    ]);
    expect(entries.find((entry) => entry.path === 'people/alex.md')?.data.toString()).toBe(
      'Alex\n',
    );
  });

  it('refuses a malformed selection', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const http = httpFor(registry);
    const post = (body: string, type = 'application/json') =>
      http(
        new Request('http://host/api/botharness/bot-zip', {
          method: 'POST',
          headers: { 'content-type': type },
          body,
        }),
      );
    expect((await post('{not json')).status).toBe(400);
    expect((await post(JSON.stringify({ slug: 'ada', include: [1] }))).status).toBe(400);
    expect((await post(JSON.stringify({ slug: 'ada', include: [] }), 'text/plain')).status).toBe(
      415,
    );
    expect((await post(JSON.stringify({ slug: 'nobody', include: [] }))).status).toBe(404);
  });
});

describe('Bot Zip import', () => {
  it('reads a re-zipped folder, skipping macOS metadata and Git internals', () => {
    const contents = readBotZip(
      writeZip([
        { path: 'Ada/SOUL.md', data: Buffer.from('# Ada\n') },
        { path: 'Ada/.git/config', data: Buffer.from('[core]\n') },
        { path: 'Ada/.DS_Store', data: Buffer.from('x') },
        { path: '__MACOSX/Ada/._SOUL.md', data: Buffer.from('x') },
        { path: 'Ada/.botharness/bot.json', data: Buffer.from('{"name":"Ada","roles":["QA"]}') },
      ]),
    );
    expect(contents.files.map((file) => file.path)).toEqual(['SOUL.md', '.botharness/bot.json']);
    expect(contents.descriptor).toEqual({ name: 'Ada', roles: ['QA'] });
    expect(zipCodeOf(() => readBotZip(writeZip([])))).toBe('empty');
  });

  it('leaves no half-created Bot when the files cannot be unpacked', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const result = await registry.createFromFiles({
      slug: 'broken',
      displayName: 'Broken',
      files: [
        { path: 'notes', data: Buffer.from('file') },
        { path: 'notes/inner.md', data: Buffer.from('conflict') },
      ],
    });
    expect(result).toEqual({ ok: false, reason: 'invalid-zip' });
    expect(registry.get('broken')).toBeUndefined();
    expect(
      readdirSync(join(root, 'bots')).filter((name) => !name.startsWith('botharness')),
    ).toEqual([]);
  });

  it('exports a Bot and imports it as a fresh Bot with the same files, profile and one commit', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const created = registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['Researcher'],
      persona: '# Ada\n',
      avatar: PNG_URL,
    });
    expect(created.ok).toBe(true);
    const memoryDir = registry.memoryDirFor('ada')!;
    writeFileSync(join(memoryDir, 'MEMORY.md'), '- people/alex.md\n');
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex likes tea\n');
    const http = httpFor(registry);

    const exported = await http(new Request('http://host/api/botharness/bot-zip?slug=ada'));
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toBe('application/zip');
    expect(exported.headers.get('content-disposition')).toContain('Ada.zip');
    const archive = new Uint8Array(await exported.arrayBuffer());
    const paths = readZip(Buffer.from(archive), LIMITS).map((entry) => entry.path);
    expect(paths).toContain('.botharness/bot.json');
    expect(paths).toContain('.botharness/avatar.png');
    expect(paths.some((path) => path === '.git' || path.startsWith('.git/'))).toBe(false);
    expect(paths.some((path) => /session|binding|credential/iu.test(path))).toBe(false);

    const imported = await http(importRequest(archive));
    expect(imported.status).toBe(200);
    const body = (await imported.json()) as { bot: { slug: string } };
    expect(body.bot.slug).toBe('zip-bot-1');
    const copy = registry.get('zip-bot-1')!;
    expect(copy).toMatchObject({ displayName: 'Ada', roles: ['Researcher'], avatar: PNG_URL });
    const copyDir = registry.memoryDirFor('zip-bot-1')!;
    for (const path of ['SOUL.md', 'MEMORY.md', 'people/alex.md', '.botharness/bot.json']) {
      expect(readFileSync(join(copyDir, path), 'utf8')).toBe(
        readFileSync(join(memoryDir, path), 'utf8'),
      );
    }
    expect(git(copyDir, 'rev-list', '--count', 'HEAD').trim()).toBe('1');
    expect(git(copyDir, 'status', '--porcelain').trim()).toBe('');
    expect(registry.get('ada')).toBeDefined();
  });

  it('answers bad uploads with clear errors and creates nothing', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const http = httpFor(registry);

    const wrongType = await http(importRequest(new Uint8Array([1]), 'x.zip', 'text/plain'));
    expect(wrongType.status).toBe(415);

    const notZip = await http(importRequest(Buffer.from('hello world, definitely not a zip')));
    expect(notZip.status).toBe(400);
    expect(((await notZip.json()) as { error: { code: string } }).error.code).toBe('invalid-zip');

    const traversal = await http(
      importRequest(writeZip([{ path: '../../outside.md', data: Buffer.from('x') }])),
    );
    expect(traversal.status).toBe(400);
    expect(((await traversal.json()) as { error: { code: string } }).error.code).toBe(
      'unsafe-path',
    );
    expect(existsSync(join(root, 'outside.md'))).toBe(false);

    const oversize = await http(
      new Request('http://host/api/botharness/bot-zip/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/zip',
          'content-length': String(BOT_ZIP_MAX_BYTES + 1),
        },
        body: new Uint8Array([1]),
      }),
    );
    expect(oversize.status).toBe(413);
    expect(registry.list()).toEqual([]);
  });

  it('names the Bot after the zip file when it has no bot.json', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const response = await httpFor(registry)(
      importRequest(writeZip([{ path: 'SOUL.md', data: Buffer.from('# Hi\n') }]), '小研.zip'),
    );
    expect(response.status).toBe(200);
    expect(registry.get('zip-bot-1')?.displayName).toBe('小研');
  });
});
