import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ComputerRuntimeRunner } from '../provider.js';
import { createMcpCuaDriver, type CuaDriver } from './driver.js';

export const LOCAL_DRIVER_VERSION = '0.31.0';
export const LOCAL_DRIVER_ASSET = `cua-driver-rs-${LOCAL_DRIVER_VERSION}-darwin-universal-binary.tar.gz`;
export const LOCAL_DRIVER_SHA256 =
  '06cd80b153bdf046dc067fb593e0fc648e780afa37a902ca0515ac25f32f9a4f';
export const LOCAL_DRIVER_FILES = {
  'libcua_driver_sdk.dylib': 'eba4a77ec52f506e7e9bca6dc5032267a77b5f09f2b0ef4eb0f6bb93e253613f',
  'cua_driver_node_runtime.node':
    'e003290019a04ad4e17c7b74610c18ea11fdacdceeafd9f1267adba1ea79afd0',
  'cua-driver': '7f9dfba2441502680b893dae07f5c7753ac3989dda6d2f18e9b2061884976f91',
} as const;

export function localDriverDirectory(home = homedir()): string {
  return join(home, '.botharness', 'cua-driver', LOCAL_DRIVER_VERSION, 'darwin');
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
        `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${LOCAL_DRIVER_VERSION}/${LOCAL_DRIVER_ASSET}`,
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
        options.onEvent?.(`phase=install version=${LOCAL_DRIVER_VERSION} target=local`);
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
