import { describe, expect, it, vi } from 'vitest';

import { joinUpstream, scrubFramingHeaders, ViewerProxy } from '../src/viewer.js';

const PREFIX = '/botharness-computer/viewer';

describe('viewer header scrubbing', () => {
  it('removes framing headers and keeps the rest', () => {
    const headers = new Headers({
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'",
      'content-type': 'text/html',
    });
    const scrubbed = scrubFramingHeaders(headers);
    expect(scrubbed.get('x-frame-options')).toBeNull();
    expect(scrubbed.get('content-security-policy')).toBeNull();
    expect(scrubbed.get('content-type')).toBe('text/html');
  });
});

describe('upstream URL joining', () => {
  it('maps the viewer prefix onto the upstream base and preserves the query', () => {
    const target = joinUpstream(
      new URL('https://127.0.0.1:39001/'),
      new URL(`http://localhost:3080${PREFIX}/vnc.html?autoconnect=1`),
      PREFIX,
    );
    expect(target.href).toBe('https://127.0.0.1:39001/vnc.html?autoconnect=1');
  });

  it('keeps a base path prefix from the provider', () => {
    const target = joinUpstream(
      new URL('https://127.0.0.1:39001/novnc/'),
      new URL(`http://localhost:3080${PREFIX}/app.js`),
      PREFIX,
    );
    expect(target.href).toBe('https://127.0.0.1:39001/novnc/app.js');
  });
});

describe('ViewerProxy', () => {
  it('answers 503 when the Computer is not running', async () => {
    const proxy = new ViewerProxy({ prefix: PREFIX, upstream: () => undefined });
    const response = await proxy.handle(new Request(`http://localhost:3080${PREFIX}/vnc.html`));
    expect(response.status).toBe(503);
  });

  it('proxies GET with scrubbed framing headers', async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response('<html></html>', {
          status: 200,
          headers: { 'x-frame-options': 'DENY', 'content-type': 'text/html' },
        }),
      ),
    );
    const proxy = new ViewerProxy({
      prefix: PREFIX,
      upstream: () => new URL('https://127.0.0.1:39001/'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const response = await proxy.handle(new Request(`http://localhost:3080${PREFIX}/vnc.html`));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-frame-options')).toBeNull();
    const [target] = fetchImpl.mock.calls[0] as unknown as [URL];
    expect(target.href).toBe('https://127.0.0.1:39001/vnc.html');
  });

  it('rejects non-GET methods', async () => {
    const proxy = new ViewerProxy({
      prefix: PREFIX,
      upstream: () => new URL('https://127.0.0.1:39001/'),
    });
    const response = await proxy.handle(
      new Request(`http://localhost:3080${PREFIX}/vnc.html`, { method: 'POST' }),
    );
    expect(response.status).toBe(405);
  });
});
