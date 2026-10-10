import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function host(
  handler: (method: string, args: Record<string, unknown>) => unknown,
  stallBody = false,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  let logins = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET') {
      logins += 1;
      if (
        new URL(req.url!, 'http://localhost').searchParams.get('token') !== 'private-test-token'
      ) {
        res.writeHead(403).end();
        return;
      }
      if (logins % 2 === 0) res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(body.type).toBe('client-request');
    expect(req.url).toBe(`/api/${body.method}`);
    const method = body.method.replace('botharness/', '');
    calls.push({ method, args: body.payload.args });
    res.setHeader('content-type', 'application/json');
    if (stallBody) {
      res.write('{');
      return;
    }
    res.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: body.rpcId,
        result: handler(method, body.payload.args),
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url?: string, stdin = '', token = 'private-test-token') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: token },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, text: out, json: JSON.parse(out) };
}

describe('live CLI over the authenticated DSH carrier', () => {
  it('classifies an interrupted response body as a transport failure', async () => {
    const live = await host(() => ({}), true);
    const result = await invoke(['release-info', '--timeout', '0.1'], live.url);
    expect(result.json.error.code).toBe('host-unreachable');
  });
  it('sends once, polls a receipt, and resumes without sending again', async () => {
    let polls = 0;
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'get'
          ? { bot: { displayName: 'Ada' } }
          : method === 'channelSend'
            ? { message: { id: 'human-11111111-1111-4111-8111-111111111111', body: 'hello' } }
            : {
                sourceEventId: 'source',
                state: polls > 1 ? 'handled' : 'running',
                replies: ++polls > 1 ? [{ id: 'reply', body: 'hello back' }] : [],
              },
    }));
    const sent = await invoke(
      [
        'send',
        'ada',
        '--body-stdin',
        '--message-id',
        'human-11111111-1111-4111-8111-111111111111',
        '--compact',
      ],
      live.url,
      'hello',
    );
    expect(sent.code).toBe(0);
    expect(sent.json.receipt).toEqual({
      channelId: 'dm-ada',
      messageId: 'human-11111111-1111-4111-8111-111111111111',
    });
    expect(sent.json.replies[0].body).toBe('hello back');
    expect(sent.text.trim().split('\n')).toHaveLength(1);
    const resumed = await invoke(
      ['send-status', 'ada', '--message-id', 'human-11111111-1111-4111-8111-111111111111'],
      live.url,
    );
    expect(resumed.code).toBe(0);
    expect(live.calls.filter((call) => call.method === 'channelSend')).toEqual([
      {
        method: 'channelSend',
        args: {
          channelId: 'dm-ada',
          body: 'hello',
          messageId: 'human-11111111-1111-4111-8111-111111111111',
        },
      },
    ]);
  });

  it('retains the receipt on timeout and never retries the mutating RPC', async () => {
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'get'
          ? { bot: { displayName: 'Ada' } }
          : method === 'channelSend'
            ? {}
            : { state: 'running', replies: [] },
    }));
    const result = await invoke(
      [
        'send',
        'ada',
        '--body',
        'slow',
        '--message-id',
        'human-22222222-2222-4222-8222-222222222222',
        '--timeout',
        '0.1',
      ],
      live.url,
    );
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('reply-timeout');
    expect(result.json.receipt.messageId).toBe('human-22222222-2222-4222-8222-222222222222');
    expect(live.calls.filter((call) => call.method === 'channelSend')).toHaveLength(1);
  });

  it('passes Host decision and question contracts through and preserves coded refusals', async () => {
    const live = await host((method) =>
      method === 'toolApprovalDecide'
        ? {
            ok: false,
            error: {
              code: 'botharness/invalid-input',
              message: 'no longer pending private-test-token',
            },
          }
        : { ok: true, value: { accepted: true } },
    );
    const decided = await invoke(
      ['tool-approval-decide', 'dm-ada', '--message-id', 'approval', '--outcome', 'rejected'],
      live.url,
    );
    expect(decided.json.error.code).toBe('botharness/invalid-input');
    const answer = { answers: [{ id: 'q1', selected: ['yes'], custom: 'details' }] };
    const answered = await invoke(
      ['user-question-answer', 'dm-ada', '--message-id', 'question', '--answer-stdin'],
      live.url,
      JSON.stringify(answer),
    );
    expect(answered.code).toBe(0);
    expect(live.calls.at(-1)?.args).toEqual({ channelId: 'dm-ada', messageId: 'question', answer });
  });

  it('rejects missing/unsafe origins, malformed answers and expired auth before mutation', async () => {
    expect((await invoke(['send', 'ada', '--body', 'hi'])).json.error.code).toBe('usage');
    expect((await invoke(['release-info'], 'http://example.com')).json.error.code).toBe('usage');
    const live = await host(() => ({ ok: true, value: {} }));
    expect((await invoke(['release-info'], live.url, '', 'expired')).json.error.code).toBe(
      'host-unauthorized',
    );
    expect(
      (
        await invoke(
          ['user-question-answer', 'dm-ada', '--message-id', 'q', '--answer-stdin'],
          live.url,
          '{}',
        )
      ).json.error.code,
    ).toBe('usage');
    expect(live.calls).toEqual([]);
  });

  it('fails closed on a stopped Host with a coded error', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));
    const result = await invoke(['send', 'ada', '--body', 'hi'], live.url);
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('host-unreachable');
  });
});
