export type BrowserFailureKind =
  | 'provision-no-network'
  | 'provision-no-disk-space'
  | 'provision-no-permission'
  | 'provision-missing-libs'
  | 'provision-failed'
  | 'startup-missing-binary'
  | 'startup-spawn-failed'
  | 'startup-sandbox'
  | 'startup-crashed'
  | 'startup-timeout';

export const BROWSER_FAILURE_KINDS: readonly BrowserFailureKind[] = [
  'provision-no-network',
  'provision-no-disk-space',
  'provision-no-permission',
  'provision-missing-libs',
  'provision-failed',
  'startup-missing-binary',
  'startup-spawn-failed',
  'startup-sandbox',
  'startup-crashed',
  'startup-timeout',
];

export function isBrowserFailureKind(value: unknown): value is BrowserFailureKind {
  return typeof value === 'string' && (BROWSER_FAILURE_KINDS as readonly string[]).includes(value);
}

export interface BrowserInstallProgress {
  readonly downloadedBytes: number;
  readonly totalBytes: number;
}
