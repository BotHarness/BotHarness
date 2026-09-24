/**
 * Opt-in Web development fallback for RC2 linked Client bundles.
 *
 * The RC2 Host publishes rebuilt frames, but replacing an active BotHarness
 * shadow slot can leave the old React tree on screen. A full document refresh
 * is predictable during UI development and leaves normal installations alone.
 */
export function mountDevClientRefresh(): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {};
  const flag = 'botharness:dev-reload';
  if (new URLSearchParams(window.location.search).get('botharness-dev-reload') === '1') {
    window.sessionStorage.setItem(flag, '1');
  }
  if (window.sessionStorage.getItem(flag) !== '1') return () => {};
  const source = new EventSource('plugins/events');
  const onMessage = (event: MessageEvent<string>): void => {
    try {
      const frame: unknown = JSON.parse(event.data);
      if (
        typeof frame === 'object' &&
        frame !== null &&
        'type' in frame &&
        frame.type === 'rebuilt' &&
        'id' in frame &&
        frame.id === '@botharness/client'
      ) {
        window.location.reload();
      }
    } catch {
      // Ignore malformed or unrelated upstream frames.
    }
  };
  source.addEventListener('message', onMessage);
  return () => {
    source.removeEventListener('message', onMessage);
    source.close();
  };
}
