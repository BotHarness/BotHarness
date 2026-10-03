import type { IncomingMessage, ServerResponse } from 'node:http';
import { extensionOrigin } from './borrow.js';
import type { BrowserViewerHost } from './viewer.js';

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 128_000) throw new Error('Extension request is too large');
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid extension request');
  return value as Record<string, unknown>;
}

export function registerExtensionHttp(
  host: BrowserViewerHost,
  prefix: string,
  dispatch: (
    action: string,
    token: string,
    origin: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<unknown>,
): () => void {
  const controllers = new Set<AbortController>();
  const release = host.register({
    kind: 'prefix',
    path: prefix.slice(0, -1),
    async handler(request: IncomingMessage, response: ServerResponse) {
      const origin = request.headers.origin ?? '';
      const address = request.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || !extensionOrigin(origin)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const headers = {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'cache-control': 'no-store',
        vary: 'Origin',
      };
      if (request.method === 'OPTIONS') {
        response.writeHead(204, headers);
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405, headers);
        response.end();
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      const close = (): void => {
        controller.abort();
      };
      response.once('close', close);
      try {
        const body = await readBody(request);
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        const token = (request.headers.authorization ?? '').replace(/^Bearer /u, '');
        const value = await dispatch(
          path.slice(prefix.length),
          token,
          origin,
          body,
          controller.signal,
        );
        if (value === undefined) {
          response.writeHead(404, headers);
          response.end();
          return;
        }
        if (!controller.signal.aborted) {
          response.writeHead(200, { ...headers, 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true, value }));
        }
      } catch {
        if (!controller.signal.aborted) {
          response.writeHead(409, { ...headers, 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              ok: false,
              error: 'Browser connection unavailable; check the extension and pairing',
            }),
          );
        }
      } finally {
        controllers.delete(controller);
        response.off('close', close);
      }
    },
  });
  return () => {
    release();
    for (const controller of controllers) controller.abort();
    controllers.clear();
  };
}
