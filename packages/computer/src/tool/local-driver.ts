import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ComputerRuntimeRunner } from '../provider.js';
import { CUA_DRIVER_VERSION, createMcpCuaDriver, type CuaDriver } from './driver.js';

export const LOCAL_DRIVER_ASSET = `cua-driver-rs-${CUA_DRIVER_VERSION}-darwin-universal-binary.tar.gz`;
export const LOCAL_DRIVER_SHA256 =
  'aaaa29538fe7b1f103afb4eddeefe2dc137690f91f8074e333cfe0e76b49918d';
export const LOCAL_DRIVER_FILES = {
  'libcua_driver_sdk.dylib': '24a5b7aa55223bd76cb60000e5d3439c7a8e84bbb8ee05b2abdd2164a7446d39',
  'cua_driver_node_runtime.node':
    'ced42da1c940f58c762304436d1a24ff87ae26af3bc9f17267fb18267539227b',
  'cua-driver': 'e0d802a126a8fc90af74ef9cccd7dde5ba82feea26c3a2ad8c492ad1f444bb1e',
} as const;

export function localDriverDirectory(home = homedir()): string {
  return join(home, '.botharness', 'cua-driver', CUA_DRIVER_VERSION, 'darwin');
}

export function localDriverEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: homedir(),
    CUA_DRIVER_RS_TELEMETRY_ENABLED: 'false',
    CUA_DRIVER_RS_UPDATE_CHECK: 'false',
    CUA_DRIVER_EMBEDDED: '1',
  };
}

export function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function verifyLocalDriver(dir: string): Promise<boolean> {
  try {
    for (const [file, digest] of Object.entries(LOCAL_DRIVER_FILES)) {
      if (checksum(await readFile(join(dir, file))) !== digest) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function installLocalDriver(options: {
  dir: string;
  runner: ComputerRuntimeRunner;
  signal?: AbortSignal | undefined;
  download?: (() => Promise<Uint8Array>) | undefined;
}): Promise<void> {
  const bytes = await (options.download?.() ??
    (async () => {
      const response = await fetch(
        `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_DRIVER_VERSION}/${LOCAL_DRIVER_ASSET}`,
        {
          signal: AbortSignal.any([
            AbortSignal.timeout(120_000),
            ...(options.signal === undefined ? [] : [options.signal]),
          ]),
        },
      );
      if (!response.ok)
        throw new Error(`Local Computer driver download failed: HTTP ${String(response.status)}`);
      return new Uint8Array(await response.arrayBuffer());
    })());
  if (options.signal?.aborted) throw new Error('Local Computer setup cancelled');
  if (checksum(bytes) !== LOCAL_DRIVER_SHA256)
    throw new Error('Local Computer driver checksum mismatch');
  await mkdir(options.dir, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(options.dir, '.install-'));
  try {
    const archive = join(staging, 'driver.tar.gz');
    await writeFile(archive, bytes, { mode: 0o600 });
    const result = await options.runner.run([
      'tar',
      '-xzf',
      archive,
      '-C',
      staging,
      ...Object.keys(LOCAL_DRIVER_FILES),
    ]);
    if (result.code !== 0 || !(await verifyLocalDriver(staging)))
      throw new Error('Local Computer driver extraction did not verify');
    if (options.signal?.aborted) throw new Error('Local Computer setup cancelled');
    await chmod(join(staging, 'cua-driver'), 0o755);
    for (const file of Object.keys(LOCAL_DRIVER_FILES))
      await rename(join(staging, file), join(options.dir, file));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export function createLocalCuaDriver(options: {
  runner: ComputerRuntimeRunner;
  dir?: string | undefined;
  onEvent?: ((detail: string) => void) | undefined;
  platform?: string | undefined;
}): CuaDriver {
  const dir = options.dir ?? localDriverDirectory();
  const path = join(dir, 'cua-driver');
  let ensuring: ReturnType<CuaDriver['ensure']> | undefined;
  return createMcpCuaDriver({
    onEvent: options.onEvent,
    retryReadOnly: false,
    async beforeOpen() {
      if (!(await verifyLocalDriver(dir)))
        throw new Error(
          'Local Computer driver checksum mismatch; check permissions again to repair',
        );
    },
    transport: { command: path, args: ['mcp', '--direct', '--embedded'], env: localDriverEnv() },
    ensure: async (signal) => {
      if ((options.platform ?? process.platform) !== 'darwin')
        throw new Error(
          'Local Computer currently requires a macOS DSH Host. Select Container Computer on a headless, Linux or Windows Host.',
        );
      ensuring ??= (async () => {
        if (await verifyLocalDriver(dir))
          return { status: 'present' as const, arch: 'darwin-universal' };
        options.onEvent?.(`phase=install version=${CUA_DRIVER_VERSION} target=local`);
        await installLocalDriver({ dir, runner: options.runner, signal });
        return { status: 'installed' as const, arch: 'darwin-universal' };
      })();
      try {
        return await ensuring;
      } finally {
        ensuring = undefined;
      }
    },
  });
}
