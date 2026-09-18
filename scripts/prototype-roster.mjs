import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../packages/client/prototype/', import.meta.url));
const port = Number(process.env.PORT ?? 4322);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const requested = url.pathname === '/' ? '/sidebar-section.html' : url.pathname;
  const file = normalize(join(root, requested));
  if (!file.startsWith(root)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(port, () => {
  const url = process.env.PORTLESS_URL ?? `http://localhost:${port}`;
  console.log(`roster prototype: ${url} (sidebar section)`);
});
