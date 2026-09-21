import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';

/** A presentation-only Channel draft; neither a Channel message nor a Source Event. */
export interface ChannelDraft {
  channelId: string;
  draftId: string;
  botSlug: string;
  body: string;
}

export type ChannelDraftEvent =
  | { type: 'update'; draft: ChannelDraft }
  | { type: 'end'; channelId: string; draftId: string };

interface DraftRun {
  channelId: string;
  botSlug: string;
  canAccess(channelId: string): boolean;
  calls: Map<string, DraftCall>;
}

interface DraftCall {
  attemptId: string;
  name: string | undefined;
  args: string;
  published: ChannelDraft | undefined;
}

function partialBody(raw: string): string | undefined {
  try {
    const complete: unknown = JSON.parse(raw);
    if (typeof complete === 'object' && complete !== null && 'body' in complete) {
      return typeof complete.body === 'string' ? complete.body : undefined;
    }
  } catch {
    // A streaming tool call is normally incomplete JSON.
  }
  const match = /(?:^|[{,])\s*"body"\s*:\s*"/.exec(raw);
  if (match === null) return undefined;
  const start = match.index + match[0].length;
  let escaped = false;
  let content = '';
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"' && !escaped) break;
    content += char;
    if (char === '\\' && !escaped) escaped = true;
    else escaped = false;
  }
  // Incomplete escapes and Unicode sequences are expected at chunk boundaries.
  for (let end = content.length; end >= 0 && end >= content.length - 6; end -= 1) {
    try {
      const body: unknown = JSON.parse(`"${content.slice(0, end)}"`);
      if (typeof body === 'string') return body;
    } catch {
      // Retry without the unfinished escape suffix.
    }
  }
  return undefined;
}

function explicitChannelId(raw: string): string | undefined {
  try {
    const args: unknown = JSON.parse(raw);
    if (typeof args !== 'object' || args === null || !('channel_id' in args)) return undefined;
    return typeof args.channel_id === 'string' ? args.channel_id : undefined;
  } catch {
    return undefined;
  }
}

/** Tracks only Orchestrator channel_send arguments; never treats final assistant text as chat. */
export class ChannelDraftTracker {
  readonly #runs = new Map<string, DraftRun>();
  readonly #publish: (event: ChannelDraftEvent) => void;

  constructor(publish: (event: ChannelDraftEvent) => void) {
    this.#publish = publish;
  }

  begin(sessionId: string, input: Omit<DraftRun, 'calls'>): void {
    this.end(sessionId);
    this.#runs.set(sessionId, { ...input, calls: new Map() });
  }

  accept(sessionId: string, frame: AssistantStreamFrame): void {
    const run = this.#runs.get(sessionId);
    if (run === undefined) return;
    if (frame.type === 'end') {
      if (frame.outcome.kind === 'abandoned') {
        for (const [callId, call] of run.calls) {
          if (call.attemptId === frame.attemptId) this.#endCall(run, callId, call);
        }
      }
      return;
    }
    if (frame.type !== 'chunk' || frame.chunk.type !== 'tool-call-delta') return;
    const chunk = frame.chunk;
    const callId = `${frame.attemptId}:${chunk.id}`;
    let call = run.calls.get(callId);
    if (call === undefined) {
      call = { attemptId: frame.attemptId, name: undefined, args: '', published: undefined };
      run.calls.set(callId, call);
    }
    call.name = chunk.name ?? call.name;
    call.args += chunk.argumentsDelta;
    if (call.name !== 'channel_send') return;
    const body = partialBody(call.args);
    if (body === undefined || body.length === 0) return;
    const channelId = explicitChannelId(call.args) ?? run.channelId;
    if (!run.canAccess(channelId)) {
      this.#endCall(run, callId, call);
      return;
    }
    if (call.published?.channelId !== undefined && call.published.channelId !== channelId) {
      this.#publish({ type: 'end', channelId: call.published.channelId, draftId: callId });
      call.published = undefined;
    }
    if (call.published?.body === body) return;
    const draft = { channelId, draftId: callId, botSlug: run.botSlug, body };
    call.published = draft;
    this.#publish({ type: 'update', draft });
  }

  end(sessionId: string): void {
    const run = this.#runs.get(sessionId);
    if (run === undefined) return;
    for (const [callId, call] of run.calls) this.#endCall(run, callId, call);
    this.#runs.delete(sessionId);
  }

  #endCall(run: DraftRun, callId: string, call: DraftCall): void {
    if (call.published !== undefined) {
      this.#publish({ type: 'end', channelId: call.published.channelId, draftId: callId });
    }
    run.calls.delete(callId);
  }
}
