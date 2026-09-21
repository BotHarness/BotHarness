/**
 * Application-defined Computer Service. Mirrors the DSH `computerUse` provider
 * seam: one exclusive registration slot, provider-owned capabilities, no
 * unified action API and no Session broker. A later DSH bump can swap the
 * registration for the official service without changing Consumers.
 * @module @botharness/computer/service
 */

import type { ComputerProvider, ComputerRuntimeProbe, ComputerStatus } from './provider.js';

export interface ComputerService {
  /** Name of the registered provider, including while its resources are closing. */
  readonly providerName: string | undefined;
  /**
   * Reserve the sole provider slot. Returns a disposer that releases it only
   * when this registration is still the current one.
   */
  registerProvider(provider: ComputerProvider): () => void;
  probe(): Promise<ComputerRuntimeProbe>;
  status(): Promise<ComputerStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  upstream(): URL | undefined;
  /** Archives the Computer store into destDir; fails closed when unsupported. */
  exportTo(destDir: string): Promise<string>;
  /** Restores the Computer store from an archive; fails closed when unsupported. */
  importFrom(archive: string): Promise<void>;
}

export function createComputerService(): ComputerService {
  let registration: { provider: ComputerProvider; token: symbol } | undefined;

  const requireProvider = (): ComputerProvider => {
    if (registration === undefined) {
      throw new Error('botharness computer: no provider is registered');
    }
    return registration.provider;
  };

  return {
    get providerName(): string | undefined {
      return registration?.provider.name;
    },
    registerProvider(provider: ComputerProvider): () => void {
      if (registration !== undefined) {
        throw new Error(
          `botharness computer: provider "${registration.provider.name}" is already registered`,
        );
      }
      const token = Symbol(provider.name);
      registration = { provider, token };
      return () => {
        if (registration?.token === token) registration = undefined;
      };
    },
    probe: async () => requireProvider().probe(),
    status: async () => requireProvider().status(),
    start: async () => {
      await requireProvider().start();
    },
    stop: async () => {
      await requireProvider().stop();
    },
    upstream: () => registration?.provider.upstream(),
    exportTo: async (destDir: string) => {
      const provider = requireProvider();
      if (provider.exportTo === undefined) {
        throw new Error(`botharness computer: provider "${provider.name}" cannot export`);
      }
      return provider.exportTo(destDir);
    },
    importFrom: async (archive: string) => {
      const provider = requireProvider();
      if (provider.importFrom === undefined) {
        throw new Error(`botharness computer: provider "${provider.name}" cannot import`);
      }
      await provider.importFrom(archive);
    },
  };
}
