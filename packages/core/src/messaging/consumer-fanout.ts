import { MessagingError, type MessagingProvider } from './provider.js';

type Consume = NonNullable<MessagingProvider['consume']>;
type Input = Parameters<Consume>[0];
type Subscriber = { input: Input; dispose(): void };

export function fanoutMessagingConsumer(
  consume: Consume,
  control?: (event: Parameters<Input['onEvent']>[0], signal: AbortSignal) => Promise<boolean>,
): Consume {
  const accounts = new Map<
    string,
    {
      fingerprint: string;
      controller: AbortController;
      subscribers: Set<Subscriber>;
      ready: Promise<() => void>;
      dispose?: () => void;
    }
  >();
  const acquire: Consume = async (input) => {
    input.signal.throwIfAborted();
    let entry = accounts.get(input.accountRef);
    if (entry?.controller.signal.aborted) {
      await entry.ready.catch(() => undefined);
      return acquire(input);
    }
    if (entry && entry.fingerprint !== input.fingerprint)
      throw new MessagingError('rebind-required');
    if (!entry) {
      const controller = new AbortController();
      const subscribers = new Set<Subscriber>();
      const dispatch = async <T>(
        event: T,
        signal: AbortSignal,
        receive: (subscriber: Subscriber, event: T, signal: AbortSignal) => Promise<unknown>,
      ) => {
        signal.throwIfAborted();
        controller.signal.throwIfAborted();
        for (const subscriber of Array.from(subscribers)) {
          if (!subscribers.has(subscriber) || subscriber.input.signal.aborted) continue;
          await receive(
            subscriber,
            event,
            AbortSignal.any([signal, controller.signal, subscriber.input.signal]),
          );
        }
        signal.throwIfAborted();
        controller.signal.throwIfAborted();
        return { accepted: true as const };
      };
      entry = {
        fingerprint: input.fingerprint,
        controller,
        subscribers,
        ready: Promise.resolve().then(() =>
          consume({
            accountRef: input.accountRef,
            fingerprint: input.fingerprint,
            signal: controller.signal,
            onEvent: async (event, signal) => {
              const current = AbortSignal.any([signal, controller.signal]);
              current.throwIfAborted();
              if (await control?.(event, current)) return { accepted: true };
              return dispatch(event, current, (subscriber, event, signal) =>
                subscriber.input.onEvent(event, signal),
              );
            },
            onEcho: (event, signal) =>
              dispatch(
                event,
                signal,
                (subscriber, event, current) =>
                  subscriber.input.onEcho?.(event, current) ?? Promise.resolve(),
              ),
          }),
        ),
      };
      accounts.set(input.accountRef, entry);
    }
    const current = entry;
    const subscriber: Subscriber = {
      input,
      dispose() {
        input.signal.removeEventListener('abort', subscriber.dispose);
        if (!current.subscribers.delete(subscriber)) return;
        if (current.subscribers.size === 0) {
          current.controller.abort();
          const release = () => {
            if (accounts.get(input.accountRef) === current) accounts.delete(input.accountRef);
          };
          if (current.dispose) {
            current.dispose();
            release();
          } else {
            void current.ready.then((dispose) => {
              dispose();
              release();
            }, release);
          }
        }
      },
    };
    current.subscribers.add(subscriber);
    input.signal.addEventListener('abort', subscriber.dispose, { once: true });
    try {
      current.dispose = await current.ready;
      input.signal.throwIfAborted();
      return subscriber.dispose;
    } catch (error) {
      subscriber.dispose();
      throw error;
    }
  };
  return acquire;
}
