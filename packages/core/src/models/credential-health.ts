export type ProviderCredentialFailure = 'missing' | 'invalid';

export interface ProviderCredentialHealth {
  observe(provider: string, code: string): void;
  failure(provider: string): ProviderCredentialFailure | undefined;
  reset(): void;
}

const failureOf: Readonly<Record<string, ProviderCredentialFailure>> = {
  MISSING_CREDENTIAL: 'missing',
  INVALID_CREDENTIAL: 'invalid',
};

export function createProviderCredentialHealth(): ProviderCredentialHealth {
  const failures = new Map<string, ProviderCredentialFailure>();
  return {
    observe(provider, code) {
      const failure = failureOf[code];
      if (failure !== undefined) failures.set(provider, failure);
    },
    failure: (provider) => failures.get(provider),
    reset: () => failures.clear(),
  };
}
