import { describe, expect, it, vi } from 'vitest';
import { diagnosticVerdict, readClientDiagnostics } from '../dev-client-diagnostics.mjs';

describe('AX diagnostic reader', () => {
  it('refuses absent, starting, stale and failed UI evidence despite healthy HTTP', () => {
    for (const state of ['starting', 'stale', 'closed'])
      expect(diagnosticVerdict({ attempts: [{ state }] }).exitCode).toBe(2);
    expect(diagnosticVerdict({ attempts: [] }).exitCode).toBe(2);
    expect(diagnosticVerdict({ attempts: [{ state: 'failed' }] }).exitCode).toBe(1);
    expect(diagnosticVerdict({ attempts: [{ state: 'shell-ready' }] }).exitCode).toBe(0);
    expect(
      diagnosticVerdict({
        attempts: [
          { attempt: 'first', state: 'failed' },
          { attempt: 'retry', state: 'shell-ready' },
        ],
      }),
    ).toMatchObject({ earlierFailures: ['first'] });
    expect(
      diagnosticVerdict(
        {
          attempts: [
            { attempt: 'first', state: 'failed' },
            { attempt: 'retry', state: 'shell-ready' },
          ],
        },
        'first',
      ).exitCode,
    ).toBe(1);
  });
  it('authenticates locally and never returns the login token or cookie', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { 'set-cookie': 'auth=private; HttpOnly' } }),
      )
      .mockResolvedValueOnce(Response.json({ version: 1, attempts: [] }));
    const result = await readClientDiagnostics(
      { url: 'http://127.0.0.1:31984/?token=private' },
      fetcher,
    );
    expect(result).toEqual({ version: 1, attempts: [] });
    expect(fetcher.mock.calls[1][1].headers).toEqual({ cookie: 'auth=private' });
  });
  it('rejects nonlocal and redirecting login destinations before sending credentials', async () => {
    const fetcher = vi.fn();
    await expect(
      readClientDiagnostics({ url: 'https://example.com/?token=private' }, fetcher),
    ).rejects.toThrow('invalid-local-launch');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
