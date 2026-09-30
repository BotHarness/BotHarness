import { safeAttachmentName } from '../attachments/store.js';
import { MemoryFileError } from './file-actions.js';
import { MemoryPathError } from './jail.js';
import type { MemoryService } from './service.js';

export const MEMORY_FILE_DOWNLOAD_PATH = '/api/botharness/memory/file';

export function createMemoryFileHttp(
  memory: MemoryService,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405, headers: { allow: 'GET' } });
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    const path = url.searchParams.get('path');
    if (!slug || path === null) return new Response('slug and path are required', { status: 400 });
    try {
      const file = memory.downloadFile(slug, path, request.signal);
      const name = safeAttachmentName(file.name);
      const ascii = name.replace(/[^\x20-\x7e]|["\\]/gu, '_');
      return new Response(file.body, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(file.size),
          'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replaceAll("'", '%27')}`,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      if (error instanceof MemoryPathError || error instanceof MemoryFileError) {
        return Response.json(
          {
            error: {
              code: error instanceof MemoryFileError ? error.code : 'invalid-path',
              message: error.message,
            },
          },
          {
            status:
              error instanceof MemoryFileError && ['unknown-bot', 'not-found'].includes(error.code)
                ? 404
                : 400,
            headers: { 'cache-control': 'no-store' },
          },
        );
      }
      throw error;
    }
  };
}
