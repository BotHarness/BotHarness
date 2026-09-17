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
  it('creates a bot and persists bot.json atomically', () => {
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
  });

  it('creates the memory dir, default or custom', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });

    registry.create({ slug: 'research', displayName: '研究助手' });
    expect(existsSync(join(root, 'research', 'memory'))).toBe(true);

    const custom = join(root, 'custom-memory');
    registry.create({ slug: 'sales', displayName: '销售', memoryDir: custom });
    expect(existsSync(custom)).toBe(true);
  });

  it('rejects duplicate slugs', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    expect(registry.create({ slug: 'a', displayName: 'A' }).ok).toBe(true);
    expect(registry.create({ slug: 'a', displayName: 'A again' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('treats an existing bot directory as duplicate even with a corrupt bot.json', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    mkdirSync(join(root, 'ghost'), { recursive: true });
    writeFileSync(join(root, 'ghost', 'bot.json'), '{ not json');

    expect(registry.create({ slug: 'ghost', displayName: 'Ghost' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('rejects invalid slugs', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    for (const slug of ['Bad', '-lead', 'trail-', 'a/b', '..', '']) {
      expect(registry.create({ slug, displayName: 'x' })).toEqual({
        ok: false,
        reason: 'invalid-slug',
      });
    }
  });

  it('falls back to the slug when the display name is blank', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    const result = registry.create({ slug: 'quiet', displayName: '   ' });
    expect(result.ok && result.record.displayName).toBe('quiet');
  });

  it('validates a custom memory dir and stores it', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    expect(registry.create({ slug: 'a', displayName: 'A', memoryDir: 'relative/path' })).toEqual({
      ok: false,
      reason: 'invalid-memory-dir',
    });
    const custom = join(root, 'memory-b');
    expect(registry.create({ slug: 'b', displayName: 'B', memoryDir: custom }).ok).toBe(true);
    expect(registry.memoryDirFor('b')).toBe(custom);
  });

  it('defaults the memory dir inside the bot home', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    expect(registry.create({ slug: 'a', displayName: 'A' }).ok).toBe(true);
    expect(registry.memoryDirFor('a')).toBe(join(root, 'a', 'memory'));
  });

  it('stores model, preset, avatar and workspaces', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    const result = registry.create({
      slug: 'research',
      displayName: '研究助手',
      avatar: 'blue',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/materials'],
    });

    expect(result.ok && result.record).toMatchObject({
      avatar: 'blue',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/materials'],
    });
  });

  it('reads records back through a fresh registry instance', () => {
    const root = createRoot();
    createPersonaBotRegistry({ rootDir: root, now: FIXED_NOW }).create({
      slug: 'research',
      displayName: '研究助手',
      avatar: 'blue',
    });

    const reloaded = createPersonaBotRegistry({ rootDir: root }).get('research');

    expect(reloaded).toMatchObject({ slug: 'research', displayName: '研究助手', avatar: 'blue' });
  });

  it('lists bots sorted and skips junk entries', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    registry.create({ slug: 'zeta', displayName: 'Z' });
    registry.create({ slug: 'alpha', displayName: 'A' });
    mkdirSync(join(root, 'not-a-bot'));
    writeFileSync(join(root, 'loose.txt'), 'x');
    mkdirSync(join(root, 'broken'));
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');

    expect(registry.list().map((record) => record.slug)).toEqual(['alpha', 'zeta']);
  });

  it('removes the record, keeping memory by default and purging on request', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });

    registry.create({ slug: 'a', displayName: 'A' });
    expect(registry.remove('a')).toBe(true);
    expect(registry.get('a')).toBeUndefined();
    expect(existsSync(join(root, 'a', 'memory'))).toBe(true);

    registry.create({ slug: 'b', displayName: 'B' });
    expect(registry.remove('b', { purge: true })).toBe(true);
    expect(existsSync(join(root, 'b'))).toBe(false);

    expect(registry.remove('missing')).toBe(false);
  });

  it('never escapes the root for hostile slugs', () => {
    const registry = createPersonaBotRegistry({ rootDir: createRoot() });
    expect(registry.get('../outside')).toBeUndefined();
    expect(registry.memoryDirFor('../outside')).toBeUndefined();
    expect(registry.remove('../outside')).toBe(false);
  });

  it('treats a corrupt bot.json as absent', () => {
    const root = createRoot();
    const registry = createPersonaBotRegistry({ rootDir: root });
    mkdirSync(join(root, 'broken'), { recursive: true });
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');

    expect(registry.get('broken')).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });
});
