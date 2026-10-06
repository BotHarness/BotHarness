import { randomUUID } from 'node:crypto';

import { safeAttachmentName } from '../attachments/store.js';
import { syncBotDescriptor } from './bot-descriptor-sync.js';
import { BOT_ZIP_MAX_BYTES, exportBotZip, readBotZip } from './bot-zip.js';
import type { PersonaBotRegistry } from './registry.js';
import { ZipArchiveError } from './zip-archive.js';

export const BOT_ZIP_EXPORT_PATH = '/api/botharness/bot-zip';
export const BOT_ZIP_IMPORT_PATH = '/api/botharness/bot-zip/import';

type DetailResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface BotZipHttpDeps {
  registry: PersonaBotRegistry;
  detail: (slug: string) => DetailResult;
  log?: (message: string) => void;
  createBotId?: () => string;
}

const NO_STORE = { 'cache-control': 'no-store' };

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

function zipFailure(error: ZipArchiveError): Response {
  return failure(error.code === 'too-large' ? 413 : 400, error.code, error.message);
}

function disposition(name: string): string {
  const safe = safeAttachmentName(`${name}.zip`);
  const ascii = safe.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/gu, (char) => '%' + char.charCodeAt(0).toString(16))}`;
}

async function readBody(request: Request): Promise<Buffer | undefined> {
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > BOT_ZIP_MAX_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function fileStem(name: string | null): string | undefined {
  const stem = name
    ?.split(/[\\/]/u)
    .at(-1)
    ?.replace(/\.zip$/iu, '')
    .trim();
  return stem === undefined || stem.length === 0 ? undefined : [...stem].slice(0, 60).join('');
}

export function createBotZipHttp(deps: BotZipHttpDeps): (request: Request) => Promise<Response> {
  const exportZip = (request: Request): Response => {
    const slug = new URL(request.url).searchParams.get('slug');
    if (!slug) return failure(400, 'invalid-input', 'slug is required');
    const record = deps.registry.get(slug);
    const memoryDir = deps.registry.memoryDirFor(slug);
    if (record === undefined || memoryDir === undefined) {
      return failure(404, 'unknown-bot', `Unknown PersonaBot: ${slug}`);
    }
    const startedAt = performance.now();
    try {
      syncBotDescriptor(memoryDir, record);
    } catch {}
    try {
      const archive = exportBotZip(memoryDir);
      deps.log?.(
        `bot-zip-export slug=${slug} bytes=${archive.length} durationMs=${Math.round(performance.now() - startedAt)}`,
      );
      return new Response(new Uint8Array(archive), {
        headers: {
          ...NO_STORE,
          'content-type': 'application/zip',
          'content-length': String(archive.length),
          'content-disposition': disposition(record.displayName),
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      if (error instanceof ZipArchiveError) return zipFailure(error);
      deps.log?.(`bot-zip-export-failed slug=${slug}`);
      return failure(500, 'memory-unavailable', 'The Bot files could not be read');
    }
  };

  const importZip = async (request: Request): Promise<Response> => {
    const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (type !== 'application/octet-stream' && type !== 'application/zip') {
      return failure(415, 'invalid-input', 'content type must be application/zip');
    }
    const declared = request.headers.get('content-length');
    if (declared !== null && Number(declared) > BOT_ZIP_MAX_BYTES) {
      return failure(413, 'too-large', 'The zip file is too large');
    }
    const archive = await readBody(request);
    if (archive === undefined) return failure(413, 'too-large', 'The zip file is too large');
    const startedAt = performance.now();
    let contents;
    try {
      contents = readBotZip(archive);
    } catch (error) {
      if (error instanceof ZipArchiveError) {
        deps.log?.(`bot-zip-import-refused reason=${error.code}`);
        return zipFailure(error);
      }
      throw error;
    }
    const slug = deps.createBotId?.() ?? 'bot-' + randomUUID().replaceAll('-', '');
    const displayName =
      contents.descriptor?.name ?? fileStem(new URL(request.url).searchParams.get('name')) ?? 'Bot';
    const result = await deps.registry.createFromFiles({
      slug,
      displayName,
      files: contents.files,
      ...(contents.descriptor?.roles === undefined ? {} : { roles: contents.descriptor.roles }),
    });
    if (!result.ok) {
      deps.log?.(`bot-zip-import-failed reason=${result.reason}`);
      return failure(
        result.reason === 'invalid-zip' ? 400 : 500,
        result.reason,
        result.reason === 'invalid-zip'
          ? 'The zip file could not be unpacked'
          : 'The Bot could not be created from this zip file',
      );
    }
    deps.log?.(
      `bot-zip-import slug=${slug} files=${contents.files.length} durationMs=${Math.round(performance.now() - startedAt)}`,
    );
    const detail = deps.detail(slug);
    if (!detail.ok) return failure(500, detail.error.code, detail.error.message);
    return Response.json(detail.value, { headers: NO_STORE });
  };

  return async (request) => {
    if (request.method === 'GET') return exportZip(request);
    if (request.method === 'POST') return importZip(request);
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  };
}
