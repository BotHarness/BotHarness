import { describe, expect, it } from 'vitest';

import { parseMemoryFile, serializeMemoryFile } from '../src/memory/front-matter.js';

const MTIME = new Date('2026-09-01T12:00:00.000Z');

describe('parseMemoryFile', () => {
  it('parses valid front-matter and separates the body', () => {
    const text = [
      '---',
      'summary: Acme account plan',
      'updated_at: 2026-09-17T08:30:00.000Z',
      'sources:',
      '  - feishu:group-42',
      '  - 2026-09-17',
      'tags:',
      '  - customer',
      '  - priority',
      '---',
      '# Acme',
      '',
      'Renewal due in Q4.',
      '',
    ].join('\n');

    const parsed = parseMemoryFile(text, { mtime: MTIME });

    expect(parsed.warnings).toEqual([]);
    expect(parsed.document).toEqual({
      summary: 'Acme account plan',
      updatedAt: '2026-09-17T08:30:00.000Z',
      sources: ['feishu:group-42', '2026-09-17'],
      tags: ['customer', 'priority'],
    });
    expect(parsed.body).toBe('# Acme\n\nRenewal due in Q4.\n');
  });

  it('degrades a file without front-matter to first line + mtime', () => {
    const parsed = parseMemoryFile('# Notes\n\nFirst fact.\n', { mtime: MTIME });

    expect(parsed.document).toEqual({
      summary: '# Notes',
      updatedAt: '2026-09-01T12:00:00.000Z',
      sources: [],
    });
    expect(parsed.body).toBe('# Notes\n\nFirst fact.\n');
    expect(parsed.warnings).toEqual(['missing front-matter']);
  });

  it('never throws on invalid YAML and degrades to the body', () => {
    const text = '---\nsummary: [unclosed\n  nope\n---\n# Broken\n';
    const parsed = parseMemoryFile(text, { mtime: MTIME });

    expect(parsed.document.summary).toBe('# Broken');
    expect(parsed.document.updatedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(parsed.warnings.some((warning) => warning.includes('front-matter'))).toBe(true);
  });

  it('defaults missing optional fields', () => {
    const text = '---\nsummary: Minimal\nupdated_at: 2026-09-10T00:00:00.000Z\n---\nBody.\n';
    const parsed = parseMemoryFile(text, { mtime: MTIME });

    expect(parsed.document).toEqual({
      summary: 'Minimal',
      updatedAt: '2026-09-10T00:00:00.000Z',
      sources: [],
    });
    expect(parsed.warnings).toEqual([]);
    expect(parsed.body).toBe('Body.\n');
  });

  it('replaces invalid field values with degraded ones and warns field by field', () => {
    const text = [
      '---',
      'summary: 42',
      'updated_at: not-a-date',
      'sources: single-string',
      'tags: nope',
      '---',
      'Real first line',
      '',
    ].join('\n');
    const parsed = parseMemoryFile(text, { mtime: MTIME });

    expect(parsed.document.summary).toBe('Real first line');
    expect(parsed.document.updatedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(parsed.document.sources).toEqual([]);
    expect(parsed.document.tags).toBeUndefined();
    const joined = parsed.warnings.join('\n');
    expect(joined).toContain('summary');
    expect(joined).toContain('updated_at');
    expect(joined).toContain('sources');
    expect(joined).toContain('tags');
  });

  it('treats an unterminated fence as degraded body text', () => {
    const text = '---\nsummary: Lost\n# Still text\n';
    const parsed = parseMemoryFile(text, { mtime: MTIME });

    expect(parsed.document.summary).toBe('---');
    expect(parsed.body).toBe(text);
    expect(parsed.warnings.join('\n')).toContain('front-matter');
  });
});

describe('serializeMemoryFile', () => {
  it('round-trips a document through the fence', () => {
    const document = {
      summary: 'Quarterly plan: "growth"',
      updatedAt: '2026-09-18T00:00:00.000Z',
      sources: ['session:abc', '2026-09-18'],
      tags: ['plan'],
    };
    const body = '# Plan\n\nSteps.\n';

    const serialized = serializeMemoryFile(document, body);

    expect(serialized.startsWith('---\n')).toBe(true);
    expect(serialized.endsWith('---\n# Plan\n\nSteps.\n')).toBe(true);
    const parsed = parseMemoryFile(serialized, { mtime: MTIME });
    expect(parsed.document).toEqual(document);
    expect(parsed.body).toBe(body);
    expect(parsed.warnings).toEqual([]);
  });

  it('omits optional fields when they are absent', () => {
    const serialized = serializeMemoryFile(
      {
        summary: 'Bare',
        updatedAt: '2026-09-18T00:00:00.000Z',
        sources: [],
      },
      'Body.\n',
    );

    expect(serialized).not.toContain('tags');
    expect(serialized).not.toContain('owner');
    expect(serialized).not.toContain('visibility');
    expect(serialized).toContain('summary: Bare');
  });
});
