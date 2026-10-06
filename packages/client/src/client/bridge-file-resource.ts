import { boundedBridgeMedia } from './bridge-image-resource.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
export interface BridgeFileState {
  busy?: boolean;
  size?: number;
  mediaType?: string;
  failure?: 'unavailable' | 'tooLarge' | 'failed';
}
export function createBridgeFileResource(
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
) {
  let state: BridgeFileState = {};
  let controller: AbortController | undefined;
  let stopLive: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: BridgeFileState) => {
    state = value;
    for (const listener of listeners) listener();
  };
  const cancel = () => {
    controller?.abort();
    controller = undefined;
    update({});
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) stopLive = subscribeMessagingDefaults(cancel);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopLive?.();
          stopLive = undefined;
          cancel();
        }
      };
    },
    cancel,
    async run(action: (blob: Blob, signal: AbortSignal) => Promise<void> | void) {
      if (controller) return;
      const request = new AbortController();
      controller = request;
      update({ ...state, busy: true, failure: undefined });
      try {
        await boundedBridgeMedia(request.signal, async () => {
          const response = await fetch(
            '/api/botharness/attachment?' +
              new URLSearchParams({ channelId, sourceEventId, attachmentId }),
            { signal: request.signal },
          );
          request.signal.throwIfAborted();
          if (!response.ok) {
            await response.body?.cancel();
            update({
              size: state.size,
              mediaType: state.mediaType,
              failure:
                response.status === 403
                  ? 'unavailable'
                  : response.status === 413
                    ? 'tooLarge'
                    : 'failed',
            });
            return;
          }
          const max = 25 * 1024 * 1024;
          if (Number(response.headers.get('content-length')) > max) {
            await response.body?.cancel();
            update({ size: state.size, mediaType: state.mediaType, failure: 'tooLarge' });
            return;
          }
          if (!response.body) throw new Error('Missing original file');
          const reader = response.body.getReader();
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let size = 0;
          try {
            while (true) {
              const next = await reader.read();
              request.signal.throwIfAborted();
              if (next.done) break;
              size += next.value.byteLength;
              if (size > max) {
                await reader.cancel();
                update({ size: state.size, mediaType: state.mediaType, failure: 'tooLarge' });
                return;
              }
              chunks.push(new Uint8Array(next.value));
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          request.signal.throwIfAborted();
          const mediaType = response.headers.get('content-type') ?? 'application/octet-stream';
          await action(new Blob(chunks, { type: mediaType }), request.signal);
          request.signal.throwIfAborted();
          update({ size, mediaType });
        });
      } catch {
        if (!request.signal.aborted)
          update({ size: state.size, mediaType: state.mediaType, failure: 'failed' });
      } finally {
        if (controller === request) controller = undefined;
      }
    },
  };
}
