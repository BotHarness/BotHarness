import { createHash } from 'node:crypto';

import type { AssignmentEventTail } from './bot-runtime.js';

/** The narrow, read-only portion of DSH Session Query this projection consumes. */
export interface AssignmentSessionQuery {
  listEvents(sessionId: string): Promise<Array<{ seq: number; type: string }>>;
  filterEvents(
    sessionId: string,
    filters: Array<{ kind: 'type'; values: string[] } | { kind: 'text'; text: string }>,
  ): Promise<Array<{ seq: number }>>;
  readEvent(input: { sessionId: string; seq: number }): Promise<{ target: unknown }>;
}

export interface AssignmentReportPage {
  text: string;
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
  matchedEvents: number;
  readCount: number;
  sourceEventBytes: number;
  returnedCharacters: number;
  estimatedTokens: number;
}

/** Read one bounded page from the accepted report's native tool/call event. */
export async function readAssignmentReportPage(
  query: AssignmentSessionQuery,
  sessionId: string,
  acceptedSummary: string,
  offset: number,
): Promise<AssignmentReportPage> {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid report offset');
  const spillFooter =
    /…\n\[Full report: \d+ bytes; sha256: ([0-9a-f]{64}); locator: [^\n]+\]$/u.exec(
      acceptedSummary,
    );
  const preview =
    spillFooter === null ? acceptedSummary : acceptedSummary.slice(0, spillFooter.index);
  const matches = await query.filterEvents(sessionId, [
    { kind: 'type', values: ['tool/call'] },
    { kind: 'text', text: 'report_to_orchestrator' },
  ]);
  let readCount = 0;
  let sourceEventBytes = 0;
  for (const match of matches.slice(-64).reverse()) {
    const { target } = await query.readEvent({ sessionId, seq: match.seq });
    readCount += 1;
    sourceEventBytes += Buffer.byteLength(JSON.stringify(target) ?? 'null', 'utf8');
    if (!isRecord(target) || target.type !== 'tool/call' || !isRecord(target.data)) continue;
    if (target.data.name !== 'report_to_orchestrator' || typeof target.data.arguments !== 'string')
      continue;
    let argumentsValue: unknown;
    try {
      argumentsValue = JSON.parse(target.data.arguments);
    } catch {
      continue;
    }
    if (!isRecord(argumentsValue) || typeof argumentsValue.summary !== 'string') continue;
    const summary = argumentsValue.summary;
    if (spillFooter === null) {
      if (summary !== acceptedSummary) continue;
    } else if (
      !summary.startsWith(preview) ||
      createHash('sha256').update(summary).digest('hex') !== spillFooter[1]
    )
      continue;
    const characters = Array.from(summary);
    const text = characters.slice(offset, offset + 2_000).join('');
    const nextOffset = offset + Array.from(text).length;
    return {
      text,
      offset,
      ...(nextOffset < characters.length ? { nextOffset } : {}),
      totalCharacters: characters.length,
      matchedEvents: matches.length,
      readCount,
      sourceEventBytes,
      returnedCharacters: Array.from(text).length,
      estimatedTokens: Math.ceil(Array.from(text).length / 4),
    };
  }
  throw new Error('Accepted Assignment report was not found in DSH Session Query');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep model-visible history bounded; the full log remains DSH's authority. */
export async function readBoundedAssignmentTail(
  query: AssignmentSessionQuery,
  sessionId: string,
): Promise<AssignmentEventTail> {
  const all = await query.listEvents(sessionId);
  const selected = all.slice(-4);
  const events: AssignmentEventTail['events'] = [];
  let sourceEventBytes = 0;
  for (const record of selected) {
    const read = await query.readEvent({ sessionId, seq: record.seq });
    const source = JSON.stringify(read.target) ?? 'null';
    const serialized = Array.from(source);
    sourceEventBytes += Buffer.byteLength(source, 'utf8');
    const length = Math.min(serialized.length, 3_000);
    events.push({
      seq: record.seq,
      type: record.type,
      text: serialized.slice(0, length).join(''),
      truncated: length < serialized.length,
    });
  }
  const returnedCharacters = events.reduce((total, event) => total + event.text.length, 0);
  return {
    events,
    indexedEvents: all.length,
    readCount: events.length,
    sourceEventBytes,
    returnedCharacters,
    estimatedTokens: Math.ceil(returnedCharacters / 4),
  };
}
