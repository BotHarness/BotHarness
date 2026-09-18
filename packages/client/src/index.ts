export const name = 'botharness-client';

/**
 * Host half of `@botharness/client`.
 *
 * The browser half is discovered from `dsh.client` and served as `lib/client.js`.
 * Until the roster needs a Host-side seam of its own, this half only exists so the
 * package has an active Loader entry (ADR-0023).
 */
export function apply(): void {}
