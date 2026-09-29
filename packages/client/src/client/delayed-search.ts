import { useCallback, useRef, useState } from 'react';

export function useDelayedSearch(delayMs: number, normalize: (value: string) => string) {
  const [query, setQuery] = useState('');
  const [delayedQuery, setDelayedQuery] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const updateQuery = (value: string): void => {
    setQuery(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setDelayedQuery(normalize(value));
    }, delayMs);
  };

  const cancelOnUnmount = useCallback((node: HTMLElement | null) => {
    if (node !== null) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  return { query, delayedQuery, updateQuery, cancelOnUnmount };
}
