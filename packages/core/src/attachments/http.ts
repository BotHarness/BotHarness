import { createMessageAttachmentFiles } from './message-files.js';
import type { ChannelStore } from '../channels/store.js';
import { ChannelAttachmentError, safeAttachmentName, type AttachmentStore } from './store.js';

export const CHANNEL_ATTACHMENT_PATH = '/api/botharness/attachment';
export const CHANNEL_ATTACHMENT_UPLOAD_PATH = '/api/botharness/attachment/upload';

async function* chunks(body: ReadableStream<Uint8Array> | null): AsyncIterable<Uint8Array> {
  if (body === null) return;
  const reader = body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function filenameDisposition(name: string, inline: boolean): string {
  const safe = safeAttachmentName(name);
  const ascii = safe.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/gu, (char) => '%' + char.charCodeAt(0).toString(16))}`;
}

function errorResponse(error: unknown): Response {
  if (error instanceof ChannelAttachmentError) {
    const status = error.code === 'too-large' ? 413 : error.code === 'not-found' ? 404 : 400;
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        status,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }
  throw error;
}

export function createAttachmentHttp(
  store: AttachmentStore,
  channels?: ChannelStore,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      if (
        request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
        'application/octet-stream'
      )
        return new Response('content type must be application/octet-stream', { status: 415 });
      const declared = request.headers.get('content-length');
      if (declared !== null && Number(declared) > store.maxBytes)
        return new Response('attachment exceeds upload limit', { status: 413 });
      try {
        const ref = await store.upload({
          data: chunks(request.body),
          ...(url.searchParams.has('name') ? { name: url.searchParams.get('name') ?? '' } : {}),
          signal: request.signal,
          ...(url.searchParams.has('uploadId')
            ? { uploadId: url.searchParams.get('uploadId') ?? '' }
            : {}),
        });
        return Response.json(
          { attachment: ref },
          {
            headers: { 'cache-control': 'no-store' },
          },
        );
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (request.method === 'GET') {
      const hash = url.searchParams.get('hash');
      const fileId = url.searchParams.get('fileId');
      const channelId = url.searchParams.get('channelId');
      const messageId = url.searchParams.get('messageId');
      if (
        fileId !== null &&
        (hash !== null || channelId === null || messageId === null || channels === undefined)
      )
        return new Response('message ownership is required', { status: 400 });
      if (fileId === null && (hash === null || !hash.startsWith('sha256:')))
        return new Response('legacy hash or message attachment is required', { status: 400 });
      try {
        const { ref, body } =
          fileId === null
            ? await store.download(hash!, url.searchParams.get('name') ?? undefined, request.signal)
            : await createMessageAttachmentFiles(channels!, store).download(
                channelId!,
                messageId!,
                fileId,
                request.signal,
              );
        const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime);
        return new Response(body, {
          headers: {
            'content-type': ref.mime,
            'content-length': String(ref.size),
            'content-disposition': filenameDisposition(ref.name, image),
            'x-content-type-options': 'nosniff',
            'cache-control': fileId === null ? 'private, max-age=3600' : 'no-store',
          },
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  };
}
