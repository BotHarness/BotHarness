import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  adoptProfileCredential,
  devSecretEnvironment,
  profileDeepSeekCredential,
  resolveDevSecret,
} from '../dev-secret.mjs';

const temporaryDirectories = [];

function fixture(credential = 'sk-test-123') {
  const root = mkdtempSync(join(tmpdir(), 'botharness-dev-secret-'));
  temporaryDirectories.push(root);
  const home = join(root, 'profile');
  mkdirSync(home);
  if (credential !== null) {
    writeFileSync(join(home, '.credentials.yaml'), `refs:\n  DEEPSEEK_API_KEY: ${credential}\n`, {
      mode: 0o600,
    });
  }
  return { home, destination: join(root, 'shared', 'dev.env') };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('shared local DeepSeek dev credential', () => {
  it('adopts one protected profile key into a private shared file', () => {
    const { home, destination } = fixture();
    expect(profileDeepSeekCredential(home)?.value).toBe('sk-test-123');

    const adopted = adoptProfileCredential(home, destination);
    expect(adopted.destination).toBe(destination);
    expect(readFileSync(destination, 'utf8')).toBe('export DEEPSEEK_API_KEY=sk-test-123\n');
    if (process.platform !== 'win32') {
      expect(statSync(destination).mode & 0o777).toBe(0o600);
      expect(statSync(join(destination, '..')).mode & 0o777).toBe(0o700);
    }
    expect(resolveDevSecret({ environment: {}, devEnvPath: destination })?.source).toBe(
      destination,
    );
    expect(
      devSecretEnvironment({ environment: {}, devEnvPath: destination }).DEEPSEEK_API_KEY,
    ).toBe('sk-test-123');
  });

  it('prefers a per-run environment override', () => {
    const { home, destination } = fixture();
    adoptProfileCredential(home, destination);
    expect(
      resolveDevSecret({
        environment: { DEEPSEEK_API_KEY: 'sk-override' },
        devEnvPath: destination,
      })?.value,
    ).toBe('sk-override');
  });

  it('never overwrites a shared credential already created', () => {
    const { home, destination } = fixture();
    adoptProfileCredential(home, destination);
    expect(() => adoptProfileCredential(home, destination)).toThrow();
    expect(readFileSync(destination, 'utf8')).toContain('sk-test-123');
  });

  it('rejects an absent or unsupported profile key', () => {
    const absent = fixture(null);
    expect(() => adoptProfileCredential(absent.home, absent.destination)).toThrow();
    const unsupported = fixture('value with spaces');
    expect(() => adoptProfileCredential(unsupported.home, unsupported.destination)).toThrow();
    const yamlNull = fixture('null');
    expect(() => adoptProfileCredential(yamlNull.home, yamlNull.destination)).toThrow();
  });

  it('refuses to copy from a broadly readable credential file', () => {
    if (process.platform === 'win32') return;
    const { home, destination } = fixture();
    const path = join(home, '.credentials.yaml');
    chmodSync(path, 0o644);
    expect(() => adoptProfileCredential(home, destination)).toThrow();
  });

  it('refuses to adopt into a broadly accessible directory', () => {
    if (process.platform === 'win32') return;
    const { home, destination } = fixture();
    const parent = join(destination, '..');
    mkdirSync(parent);
    chmodSync(parent, 0o755);
    expect(() => adoptProfileCredential(home, destination)).toThrow();
  });

  it('refuses to load a broadly readable shared file', () => {
    if (process.platform === 'win32') return;
    const { home, destination } = fixture();
    adoptProfileCredential(home, destination);
    chmodSync(destination, 0o644);
    expect(() => resolveDevSecret({ environment: {}, devEnvPath: destination })).toThrow();
  });
});
