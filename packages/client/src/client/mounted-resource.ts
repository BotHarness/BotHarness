import { useCallback, useRef, type DependencyList, type RefCallback } from 'react';

export function useMountedResource<T extends Element>(
  start: () => void | (() => void),
  dependencies: DependencyList,
): RefCallback<T> {
  const cleanup = useRef<(() => void) | undefined>(undefined);
  return useCallback((node: T | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    if (node !== null) cleanup.current = start() || undefined;
  }, dependencies);
}
