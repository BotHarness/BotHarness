export function mountDevClientRefresh(): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {};
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return () => {};
  if (new URLSearchParams(window.location.search).get('botharness-dev-reload') !== '1')
    return () => {};
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
        frame.id === '@botharness/ui'
      ) {
        window.location.reload();
      }
    } catch {}
  };
  source.addEventListener('message', onMessage);
  return () => {
    source.removeEventListener('message', onMessage);
    source.close();
  };
}
