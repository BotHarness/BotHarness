export interface MessagingAccount {
  ref: string;
  platform: string;
  name: string;
  fingerprint: string;
  connected: boolean;
}

export interface MessagingTarget {
  ref: string;
  name: string;
  digest: string;
}

export interface MessagingProvider {
  id: string;
  accounts(): Promise<MessagingAccount[]>;
  targets(accountRef: string): Promise<MessagingTarget[]>;
  inspect(
    accountRef: string,
    targetRef: string,
  ): Promise<{
    account: MessagingAccount;
    target: MessagingTarget;
  }>;
  send(input: {
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
    text: string;
    signal: AbortSignal;
  }): Promise<{ accepted: true }>;
}

export class MessagingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MessagingError';
  }
}

export class MessagingProviderError extends Error {
  constructor(
    readonly code: string,
    readonly disposition: 'not-started' | 'unknown',
  ) {
    super(code);
    this.name = 'MessagingProviderError';
  }
}
