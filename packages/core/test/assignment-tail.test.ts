import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  readAssignmentReportPage,
  readBoundedAssignmentTail,
} from '../src/runtime/assignment-tail.js';

describe('Assignment Session Query tail', () => {
  it('reads only the last four records and accounts for a bounded model result', async () => {
    const readEvent = vi.fn(async ({ seq }: { sessionId: string; seq: number }) => ({
      target: { type: 'tool/call', data: 'long'.repeat(2_000), seq },
    }));
    const result = await readBoundedAssignmentTail(
      {
        listEvents: async () =>
          Array.from({ length: 10 }, (_, seq) => ({ seq, type: 'tool/call' })),
        filterEvents: async () => [],
        readEvent,
      },
      'owned-assignment',
    );
    expect(readEvent.mock.calls.map(([input]) => input.seq)).toEqual([6, 7, 8, 9]);
    expect(result).toMatchObject({
      indexedEvents: 10,
      readCount: 4,
      returnedCharacters: 12_000,
      estimatedTokens: 3_000,
    });
    expect(result.events.every((event) => event.truncated && event.text.length === 3_000)).toBe(
      true,
    );
  });

  it('reads the accepted native report in bounded pages and ignores a later unaccepted call', async () => {
    const summary = 'Report '.repeat(900);
    const preview = Array.from(summary).slice(0, 400).join('');
    const digest = createHash('sha256').update(summary).digest('hex');
    const readEvent = vi.fn(async ({ seq }: { sessionId: string; seq: number }) => ({
      target: {
        type: 'tool/call',
        data: {
          name: 'report_to_orchestrator',
          arguments: JSON.stringify({ summary: seq === 8 ? summary : `${summary}changed` }),
        },
      },
    }));
    const query = {
      listEvents: async () => [],
      filterEvents: async () => [{ seq: 8 }, { seq: 11 }],
      readEvent,
    };
    const first = await readAssignmentReportPage(
      query,
      'owned-assignment',
      `${preview}…\n[Full report: 6300 bytes; sha256: ${digest}; locator: opaque; read hint]`,
      0,
    );
    expect(first).toMatchObject({
      text: summary.slice(0, 2_000),
      nextOffset: 2_000,
      totalCharacters: summary.length,
      matchedEvents: 2,
      readCount: 2,
      returnedCharacters: 2_000,
      estimatedTokens: 500,
    });
    const last = await readAssignmentReportPage(
      query,
      'owned-assignment',
      `${preview}…\n[Full report: 6300 bytes; sha256: ${digest}; locator: opaque; read hint]`,
      6_000,
    );
    expect(last).toMatchObject({ text: summary.slice(6_000), offset: 6_000 });
    expect(last.nextOffset).toBeUndefined();
    await expect(readAssignmentReportPage(query, 'owned-assignment', preview, -1)).rejects.toThrow(
      'Invalid report offset',
    );
  });
});
