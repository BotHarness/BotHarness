import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPersonaBotRegistry, isValidSlug } from '../src/index.js';

const roots: string[] = [];
const FIXED_NOW = (): Date => new Date('2026-09-17T00:00:00.000Z');

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'botharness-registry-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe('isValidSlug', () => {
  it('accepts kebab-case slugs and rejects hostile ones', () => {
    expect(isValidSlug('sales-assistant')).toBe(true);
    expect(isValidSlug('a1')).toBe(true);
    expect(isValidSlug('Sales')).toBe(false);
    expect(isValidSlug('-lead')).toBe(false);
    expect(isValidSlug('trail-')).toBe(false);
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('../evil')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a'.repeat(65))).toBe(false);
  });
});

describe('createPersonaBotRegistry', () => {
  it('persists bot.json and reads it back through a fresh instance', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root, now: FIXED_NOW });

    const result = registry.create({ slug: 'research', displayName: '研究助手' });

    expect(result.ok).toBe(true);
    const stored = JSON.parse(readFileSync(join(root, 'research', 'bot.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(stored).toMatchObject({
      slug: 'research',
      displayName: '研究助手',
      workspaces: [],
      createdAt: '2026-09-17T00:00:00.000Z',
    });
    expect(createPersonaBotRegistry({ rootDir: root }).get('research')).toMatchObject({
      slug: 'research',
    });
  });

  it('creates the default memory dir inside the bot home and reports it', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    registry.create({ slug: 'research', displayName: '研究助手' });

    expect(existsSync(join(root, 'research', 'memory'))).toBe(true);
    expect(registry.memoryDirFor('research')).toBe(join(root, 'research', 'memory'));
  });

  it('rejects duplicate slugs', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    expect(registry.create({ slug: 'a', displayName: 'A' }).ok).toBe(true);
    expect(registry.create({ slug: 'a', displayName: 'A again' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('rejects invalid slugs at create time and never escapes the root', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    expect(registry.create({ slug: '../evil', displayName: 'x' })).toEqual({
      ok: false,
      reason: 'invalid-slug',
    });
    expect(registry.get('../outside')).toBeUndefined();
    expect(registry.memoryDirFor('../outside')).toBeUndefined();
    expect(registry.remove('../outside')).toBe(false);
  });

  it('falls back to the slug when the display name is blank', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    const result = registry.create({ slug: 'quiet', displayName: '   ' });
    expect(result.ok && result.record.displayName).toBe('quiet');
  });

  it('rejects a relative memory dir and stores an absolute one', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    expect(registry.create({ slug: 'a', displayName: 'A', memoryDir: 'relative/path' })).toEqual({
      ok: false,
      reason: 'invalid-memory-dir',
    });
    const custom = join(root, 'memory-b');
    expect(registry.create({ slug: 'b', displayName: 'B', memoryDir: custom }).ok).toBe(true);
    expect(registry.memoryDirFor('b')).toBe(custom);
    expect(existsSync(custom)).toBe(true);
  });

  it('finds a bot by workspace, tolerating trailing slashes and unknown paths', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    registry.create({
      slug: 'research',
      displayName: 'Research',
      workspaces: [join(root, 'ws-a')],
    });
    registry.create({ slug: 'sales', displayName: 'Sales' });

    expect(registry.findByWorkspace(join(root, 'ws-a'))?.slug).toBe('research');
    expect(registry.findByWorkspace(`${join(root, 'ws-a')}/`)?.slug).toBe('research');
    expect(registry.findByWorkspace(join(root, 'missing'))).toBeUndefined();
    expect(registry.findByWorkspace('')).toBeUndefined();
  });

  it('stores model, preset, avatar and workspaces', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    const result = registry.create({
      slug: 'research',
      displayName: '研究助手',
      tag: '研究',
      description: '检索与写作',
      avatar: 'blue',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/materials'],
    });

    expect(result.ok && result.record).toMatchObject({
      tag: '研究',
      description: '检索与写作',
      avatar: 'blue',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/materials'],
    });
  });

  it('trims tag and description and omits blank ones', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    const padded = registry.create({
      slug: 'padded',
      displayName: 'Padded',
      tag: '  研究  ',
      description: '  一行简介  ',
    });
    const blank = registry.create({
      slug: 'blank',
      displayName: 'Blank',
      tag: '   ',
      description: '',
    });

    expect(padded.ok && padded.record).toMatchObject({ tag: '研究', description: '一行简介' });
    expect(blank.ok && 'tag' in blank.record).toBe(false);
    expect(blank.ok && 'description' in blank.record).toBe(false);
  });

  it('lists bots sorted and skips junk entries and poisoned records', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    registry.create({ slug: 'zeta', displayName: 'Z' });
    registry.create({ slug: 'alpha', displayName: 'A' });
    mkdirSync(join(root, 'not-a-bot'));
    writeFileSync(join(root, 'loose.txt'), 'x');
    mkdirSync(join(root, 'broken'));
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');
    mkdirSync(join(root, 'poisoned'));
    writeFileSync(
      join(root, 'poisoned', 'bot.json'),
      JSON.stringify({ slug: 'someone-else', displayName: 'X', workspaces: [], createdAt: 'now' }),
    );

    expect(registry.list().map((record) => record.slug)).toEqual(['alpha', 'zeta']);
    expect(registry.get('broken')).toBeUndefined();
  });

  it('removes the record, keeps memory by default, purges on request and frees the slug', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });

    registry.create({ slug: 'a', displayName: 'A' });
    expect(registry.remove('a')).toBe(true);
    expect(registry.get('a')).toBeUndefined();
    expect(existsSync(join(root, 'a', 'memory'))).toBe(true);
    expect(registry.create({ slug: 'a', displayName: 'A again' }).ok).toBe(true);

    registry.create({ slug: 'b', displayName: 'B' });
    expect(registry.remove('b', { purge: true })).toBe(true);
    expect(existsSync(join(root, 'b'))).toBe(false);

    expect(registry.remove('missing')).toBe(false);
  });

  it('treats a corrupt bot.json as absent and recreates over it', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    mkdirSync(join(root, 'broken', 'memory'), { recursive: true });
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');

    expect(registry.get('broken')).toBeUndefined();
    expect(registry.list()).toEqual([]);
    expect(registry.create({ slug: 'broken', displayName: 'Broken' }).ok).toBe(true);
    expect(existsSync(join(root, 'broken', 'memory'))).toBe(true);
  });
});
