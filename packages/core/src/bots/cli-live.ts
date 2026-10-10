import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { dmChannelId } from '../channels/channel.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import {
  IM_COMMANDS,
  IM_OPTIONS,
  prepareImAuthorization,
  runImAuthorization,
  type ImValues,
} from './cli-im-authorization.js';
export { CliLiveError } from './cli-live-error.js';

export const LIVE_OPTIONS = {
  ...IM_OPTIONS,
  host: { type: 'string' },
  'token-file': { type: 'string' },
  timeout: { type: 'string' },
  'message-id': { type: 'string' },
  outcome: { type: 'string' },
  'answer-stdin': { type: 'boolean' },
  since: { type: 'string' },
  workspace: { type: 'string' },
} as const;

export const LIVE_COMMANDS = [
  ...IM_COMMANDS,
  {
    command: 'send',
    description: 'send a Human DM and collect its committed Bot reply from a live Host',
  },
  {
    command: 'send-status',
    description: 'inspect a Human DM receipt and its exact Bot replies without resending',
  },
  {
    command: 'tool-approval-status',
    description: 'inspect a pending tool approval on a live Host',
  },
  { command: 'tool-approval-decide', description: 'allow once or reject an owned tool approval' },
  { command: 'user-question-status', description: 'inspect a formal Human question' },
  {
    command: 'user-question-answer',
    description: 'answer a formal Human question with JSON from stdin',
  },
  { command: 'release-info', description: 'read the running Host release lifecycle' },
  { command: 'workspace-options', description: 'list live Host workspaces for grants' },
  { command: 'grant-create', description: 'authorize a Bot workspace through the live Host' },
] as const;

interface LiveValues extends ImValues {
  host?: string;
  'token-file'?: string;
  timeout?: string;
  'message-id'?: string;
  body?: string;
  'body-stdin'?: boolean;
  'answer-stdin'?: boolean;
  outcome?: string;
  since?: string;
  workspace?: string;
  limit?: string;
  before?: string;
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function hostUrl(value: string | undefined): URL {
  if (!value) usage('Live commands require --host or DEEPSEEKBOT_HOST.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    usage('--host must be an HTTP(S) origin.');
  }
  const name = url.hostname;
  const loopback = name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(name);
  const tailnet =
    name.endsWith('.ts.net') || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(name);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      (loopback && (url.protocol === 'http:' || url.protocol === 'https:')) ||
      (tailnet && url.protocol === 'https:')
    )
  ) {
    usage(
      '--host must be a loopback origin or a tailnet HTTPS origin, without credentials, query or path.',
    );
  }
  return url;
}

function timeoutMs(value: string | undefined): number {
  const seconds = value === undefined ? 120 : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    usage('--timeout must be between 0 and 600 seconds.');
  return Math.ceil(seconds * 1000);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

async function connect(values: LiveValues, io: BotCreateCliIo, signal: AbortSignal) {
  const base = hostUrl(values.host ?? io.env['DEEPSEEKBOT_HOST']);
  let token = io.env['DEEPSEEKBOT_HOST_TOKEN'];
  if (values['token-file'] !== undefined) {
    try {
      token = readFileSync(values['token-file'], 'utf8').trim();
    } catch {
      throw new CliLiveError('host-unauthorized', 'Cannot read the Host token file.');
    }
  }
  if (!token?.trim())
    throw new CliLiveError(
      'host-unauthorized',
      'Set DEEPSEEKBOT_HOST_TOKEN or provide --token-file.',
    );
  const secret = token.trim();
  const login = new URL(base);
  login.searchParams.set('token', secret);
  let cookie = '';
  const request = async (url: URL, init: RequestInit = {}): Promise<Response> => {
    try {
      return await fetch(url, { ...init, signal, redirect: 'manual' });
    } catch {
      throw new CliLiveError(
        'host-unreachable',
        'The Host could not be reached before the command deadline.',
      );
    }
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(login, { headers: cookie ? { cookie } : {} });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) cookie = cookies.map((entry) => entry.split(';')[0]).join('; ');
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403)
      throw new CliLiveError(
        'host-unauthorized',
        'Host login was refused; refresh its launch token.',
      );
    if (cookie) break;
  }
  if (!cookie)
    throw new CliLiveError('host-unauthorized', 'Host login did not issue an authority cookie.');
  return async <T>(method: string, args: Record<string, unknown>): Promise<T> => {
    const name = method === 'dsh-im/app-setup' ? method : `botharness/${method}`;
    const response = await request(new URL(`/api/${name}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: name,
        payload: method === 'dsh-im/app-setup' ? args : { args },
      }),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new CliLiveError(
        'host-unauthorized',
        'The Host refused this authority cookie; refresh its launch token.',
      );
    }
    let payload: Record<string, unknown>;
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new CliLiveError(
        'host-unreachable',
        'The Host response was interrupted before the command deadline.',
      );
    }
    try {
      payload = record(JSON.parse(body));
    } catch {
      throw new CliLiveError('host-protocol-error', 'The Host did not return a DSH RPC response.');
    }
    if (!response.ok || payload['type'] !== 'server-response')
      throw new CliLiveError('host-protocol-error', 'The Host did not return a DSH RPC response.');
    const result = record(payload['result']);
    if (result['ok'] !== true) {
      const error = record(result['error']);
      const code = typeof error['code'] === 'string' ? error['code'] : 'host-protocol-error';
      const message =
        typeof error['message'] === 'string' ? error['message'] : 'The Host refused the command.';
      throw new CliLiveError(
        code,
        message
          .replaceAll(secret, '[redacted]')
          .replaceAll(encodeURIComponent(secret), '[redacted]'),
      );
    }
    return result['value'] as T;
  };
}

export async function runLiveCli(
  command: string,
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (IM_COMMANDS.some((entry) => entry.command === command)) {
    const operation = await prepareImAuthorization(command, rest, values, io);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    try {
      return await runImAuthorization(operation, await connect(values, io, signal), signal);
    } catch (error) {
      if (
        error instanceof CliLiveError &&
        !error.authorization &&
        command !== 'im-apps' &&
        command !== 'im-authorize'
      )
        throw new CliLiveError(error.code, error.message, undefined, {
          attemptId: operation.target,
        });
      throw error;
    }
  }
  const noTarget = command === 'release-info' || command === 'workspace-options';
  if (rest.length !== (noTarget ? 0 : 1))
    usage(
      `${command} ${noTarget ? 'takes no positional arguments' : 'needs exactly one target id'}.`,
    );
  const target = rest[0]?.trim() ?? '';
  if (!noTarget && !target) usage(`${command} requires a nonempty target id.`);
  const messageId = values['message-id'];
  if (
    [
      'send-status',
      'tool-approval-status',
      'tool-approval-decide',
      'user-question-status',
      'user-question-answer',
    ].includes(command) &&
    !messageId?.trim()
  )
    usage('--message-id is required.');
  let body: string | undefined;
  let answer: unknown;
  if (command === 'send') {
    if ((values.body !== undefined) === (values['body-stdin'] === true))
      usage('send requires exactly one of --body or --body-stdin.');
    body = values['body-stdin'] ? await (io.readStdin?.() ?? Promise.resolve('')) : values.body;
    if (!body?.trim()) usage('send requires a nonempty message.');
    if (
      messageId !== undefined &&
      !/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(messageId)
    )
      usage('--message-id must be human- followed by a UUID.');
  }
  if (
    command === 'tool-approval-decide' &&
    values.outcome !== 'allowed-once' &&
    values.outcome !== 'rejected'
  )
    usage('--outcome must be allowed-once or rejected.');
  if (command === 'user-question-answer') {
    if (!values['answer-stdin']) usage('user-question-answer requires --answer-stdin.');
    try {
      answer = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      usage('Question answers must be valid JSON on stdin.');
    }
    const answers = record(answer)['answers'];
    if (
      !Array.isArray(answers) ||
      !answers.every((entry) => {
        const item = record(entry);
        return (
          typeof item['id'] === 'string' &&
          Array.isArray(item['selected']) &&
          item['selected'].every((choice) => typeof choice === 'string') &&
          (item['custom'] === undefined || typeof item['custom'] === 'string')
        );
      })
    )
      usage(
        'Answer JSON requires answers with id, selected string array and optional custom text.',
      );
  }
  if (command === 'grant-create' && !values.workspace?.trim()) usage('--workspace is required.');
  const duration = timeoutMs(values.timeout);
  const deadline = Date.now() + duration;
  const signal = AbortSignal.timeout(duration);
  const rpc = await connect(values, io, signal);
  if (command === 'send') {
    const channelId = dmChannelId(target);
    const receipt = { channelId, messageId: messageId ?? `human-${randomUUID()}` };
    let sent: unknown;
    try {
      const bot = await rpc<{ bot: { displayName?: string } }>('get', { slug: target });
      await rpc('channelDm', { slug: target, displayName: bot.bot.displayName });
      sent = await rpc('channelSend', { channelId, body, messageId: receipt.messageId });
      while (Date.now() < deadline) {
        const status = await rpc<{ state: string; replies: unknown[] }>(
          'channelSendStatus',
          receipt,
        );
        if (!status || !Array.isArray(status.replies) || typeof status.state !== 'string')
          throw new CliLiveError(
            'host-protocol-error',
            'The Host returned an invalid send status.',
          );
        if (status.state === 'handled' && status.replies.length > 0)
          return { receipt, ...record(sent), ...status };
        if (status.state === 'handled' || status.state === 'needs-repair')
          throw new CliLiveError(
            status.state === 'handled' ? 'reply-not-produced' : 'send-needs-repair',
            'The Host has no committed Bot reply for this request.',
            receipt,
          );
        await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
      }
    } catch (error) {
      if (error instanceof CliLiveError) throw new CliLiveError(error.code, error.message, receipt);
      throw new CliLiveError(
        'reply-timeout',
        'The command deadline elapsed; inspect send-status with this receipt before retrying.',
        receipt,
      );
    }
    throw new CliLiveError(
      'reply-timeout',
      'No reply before the deadline; inspect send-status with this receipt before retrying.',
      receipt,
    );
  }
  if (command === 'send-status')
    return rpc('channelSendStatus', { channelId: dmChannelId(target), messageId });
  if (command === 'channel-messages') {
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200))
      usage('--limit must be 1–200.');
    return rpc('channelMessages', {
      channelId: target,
      ...(limit === undefined ? {} : { limit }),
      ...(values.before === undefined ? {} : { before: values.before }),
    });
  }
  if (command === 'tool-approval-status')
    return rpc('toolApprovalStatus', { channelId: target, messageId });
  if (command === 'tool-approval-decide')
    return rpc('toolApprovalDecide', { channelId: target, messageId, outcome: values.outcome });
  if (command === 'user-question-status')
    return rpc('userQuestionStatus', { channelId: target, messageId });
  if (command === 'user-question-answer')
    return rpc('userQuestionAnswer', { channelId: target, messageId, answer });
  if (command === 'workspace-options') return rpc('workspaceOptions', {});
  if (command === 'grant-create')
    return rpc('grantCreate', { slug: target, workspaceId: values.workspace });
  return rpc('releaseInfo', values.since === undefined ? {} : { since: values.since });
}
