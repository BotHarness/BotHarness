/**
 * Pinned Cua Driver supply and stdio MCP connection for the Computer Tool
 * Provider. The driver runs inside the Computer container; this module
 * installs the checksummed binary into the persistent volume and speaks MCP
 * to it through `docker exec -i`. Nothing here is model-facing; the provider
 * adapts tools and content (see ./provider.ts).
 * @module @botharness/computer/tool/driver
 */

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import type { ComputerRuntimeRunner } from '../provider.js';

/** Pinned driver release (checksum verified against the published checksums.txt). */
export const CUA_DRIVER_VERSION = '0.28.0';

/** Install directory inside the container's persistent volume. */
export const CUA_DRIVER_DIR = `/config/.botharness/cua-driver/${CUA_DRIVER_VERSION}`;

/** Absolute path of the installed driver executable. */
export const CUA_DRIVER_PATH = `${CUA_DRIVER_DIR}/cua-driver`;

/** Desktop user the container runs as (linuxserver/webtop convention). */
const DESKTOP_USER = 'abc';

/** Driver process env: telemetry and update checks stay off (ADR-0050/0079). */
const DRIVER_ENV_ARGS = [
  '-e',
  'CUA_DRIVER_RS_TELEMETRY_ENABLED=false',
  '-e',
  'CUA_DRIVER_RS_UPDATE_CHECK=false',
] as const;

/** One tool as the driver's MCP catalog lists it. */
export interface DriverToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: unknown;
}

export interface CuaDriverOptions {
  readonly runner: ComputerRuntimeRunner;
  readonly containerName: string;
  /** Container/lifecycle detail for the diagnostics stream. */
  readonly onEvent?: (detail: string) => void;
}

export interface CuaDriver {
  /** Ensure the pinned driver exists in the container volume; install when missing. */
  ensure(signal?: AbortSignal): Promise<{ status: 'present' | 'installed'; arch: string }>;
  /** List the driver's catalog (one MCP `tools/list`). */
  tools(signal?: AbortSignal): Promise<readonly DriverToolDescriptor[]>;
  /** Call one driver tool by its raw name; returns the raw MCP result. */
  call(rawName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  /** Drop the MCP child (the next call re-opens it). */
  close(): Promise<void>;
}

/** Observation tools safe to retry once after a transport loss (no side effect). */
const READ_ONLY_TOOLS = new Set([
  'list_windows',
  'get_desktop_state',
  'get_window_state',
  'verify_state',
]);

/** Maps `uname -m` output onto the release asset suffix. */
export function driverAssetArch(machine: string): string {
  const value = machine.trim();
  if (value === 'x86_64' || value === 'amd64') return 'linux-x86_64';
  if (value === 'aarch64' || value === 'arm64') return 'linux-arm64';
  throw new Error(`unsupported Computer architecture "${machine}"`);
}

/** Release asset URL for one architecture. */
export function driverAssetUrl(arch: string): string {
  return `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_DRIVER_VERSION}/cua-driver-rs-${CUA_DRIVER_VERSION}-${arch}-binary.tar.gz`;
}

/** Install script run as root inside the container (idempotent). */
export function driverInstallScript(arch: string): string {
  const asset = `cua-driver-rs-${CUA_DRIVER_VERSION}-${arch}-binary.tar.gz`;
  return [
    'set -euo pipefail',
    `D=${CUA_DRIVER_DIR}`,
    'mkdir -p "$D"',
    'TMP=$(mktemp -d)',
    'trap \'rm -rf "$TMP"\' EXIT',
    `curl -fsSL -o "$TMP/${asset}" '${driverAssetUrl(arch)}'`,
    `curl -fsSL -o "$TMP/checksums.txt" 'https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_DRIVER_VERSION}/checksums.txt'`,
    `(cd "$TMP" && grep ' ${asset}$' checksums.txt | sha256sum -c -)`,
    `tar -xzf "$TMP/${asset}" -C "$D"`,
    `chmod +x "$D/cua-driver"`,
    `chown -R ${DESKTOP_USER}:${DESKTOP_USER} /config/.botharness`,
  ].join('\n');
}

export function createCuaDriver(options: CuaDriverOptions): CuaDriver {
  const { runner, containerName, onEvent } = options;
  const log = (detail: string): void => onEvent?.(detail);

  /** `docker exec …` argv after the executable name; the MCP transport spawns
   * `docker` itself, while the runtime runner takes the full argv. */
  const execArgs = (argv: readonly string[], user: string): string[] => [
    'exec',
    // `-i` keeps the child's stdin open: stdio MCP ends at stdin EOF, and
    // without it the driver exits right after startup (found live 2026-09-28).
    '-i',
    '-u',
    user,
    '-e',
    'HOME=/config',
    '-e',
    'DISPLAY=:1',
    ...DRIVER_ENV_ARGS,
    containerName,
    ...argv,
  ];

  const insideArgs = (argv: readonly string[], user: string): string[] => [
    'docker',
    ...execArgs(argv, user),
  ];

  const runInside = async (
    argv: readonly string[],
    user: string,
    signal?: AbortSignal,
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    if (signal?.aborted === true) throw new Error('computer driver operation aborted');
    return runner.run(insideArgs(argv, user));
  };

  let client: Client | undefined;
  let opening: Promise<Client> | undefined;
  let catalog: readonly DriverToolDescriptor[] | undefined;

  const dropClient = async (): Promise<void> => {
    const current = client;
    client = undefined;
    opening = undefined;
    catalog = undefined;
    if (current === undefined) return;
    try {
      await current.close();
    } catch {
      // A dead child cannot be closed; dropping the reference is the cleanup.
    }
  };

  const openClient = async (): Promise<Client> => {
    const transport = new StdioClientTransport({
      command: 'docker',
      args: execArgs([CUA_DRIVER_PATH, 'mcp'], DESKTOP_USER),
      // The child is `docker`; the desktop env rides the exec argv. Only PATH
      // (and nothing else) is inherited so the transport stays deterministic.
      env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' },
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      for (const line of String(chunk).split('\n'))
        if (line.trim() !== '') log(`driver: ${line.trim()}`);
    });
    // Match the DSH mcp-client client options: `auto` version negotiation is
    // what the driver accepts; the SDK default closed the connection
    // immediately (found live 2026-09-28).
    const created = new Client(
      { name: 'botharness-computer', version: '0.0.0' },
      { capabilities: {}, versionNegotiation: { mode: 'auto' } },
    );
    created.onerror = (error) => log(`driver connection error: ${String(error)}`);
    created.onclose = () => log('driver connection closed');
    transport.onclose = () => log(`driver child exited (pid ${String(transport.pid ?? '?')})`);
    transport.onerror = (error) => log(`driver transport error: ${String(error)}`);
    await created.connect(transport);
    const listed = await created.listTools();
    catalog = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    }));
    client = created;
    log(`driver connected: ${catalog.length} tools`);
    return created;
  };

  const ensureClient = async (): Promise<Client> => {
    if (client !== undefined) return client;
    opening ??= openClient().catch(async (error: unknown) => {
      await dropClient();
      throw error;
    });
    try {
      return await opening;
    } catch (error) {
      opening = undefined;
      throw error;
    }
  };

  return {
    async ensure(signal) {
      const machine = await runInside(['uname', '-m'], 'root', signal);
      if (machine.code !== 0) throw new Error('the Computer is not running');
      const arch = driverAssetArch(machine.stdout);
      const present = await runInside([CUA_DRIVER_PATH, '--version'], DESKTOP_USER, signal);
      if (present.code === 0) {
        log(`driver present: ${present.stdout.trim()}`);
        return { status: 'present', arch };
      }
      log(`driver missing; installing ${CUA_DRIVER_VERSION} (${arch})`);
      const installed = await runInside(['sh', '-c', driverInstallScript(arch)], 'root', signal);
      if (installed.code !== 0) {
        throw new Error(`Cua Driver install failed: ${installed.stderr.trim().slice(0, 300)}`);
      }
      const verified = await runInside([CUA_DRIVER_PATH, '--version'], DESKTOP_USER, signal);
      if (verified.code !== 0) throw new Error('Cua Driver install did not verify');
      log(`driver installed: ${verified.stdout.trim()}`);
      return { status: 'installed', arch };
    },

    async tools(signal) {
      await ensureClient();
      if (signal?.aborted === true) throw new Error('computer driver operation aborted');
      return catalog ?? [];
    },

    async call(rawName, args, signal) {
      const alreadyAborted = signal?.aborted === true;
      if (alreadyAborted) throw new Error('computer driver operation aborted');
      const options = signal === undefined ? undefined : { signal };
      const active = await ensureClient();
      try {
        return await active.callTool({ name: rawName, arguments: args }, options);
      } catch (error) {
        // Protocol/transport failures drop the child so the next call
        // reconnects; a container restart therefore never wedges the bridge.
        await dropClient();
        if (alreadyAborted || !READ_ONLY_TOOLS.has(rawName)) throw error;
        // Observation calls have no side effect, so one transparent retry is
        // safe; action calls surface the error and let the model re-observe
        // before deciding to act again (cancellation never rolls back).
        const retry = await ensureClient();
        return await retry.callTool({ name: rawName, arguments: args }, options);
      }
    },

    async close() {
      await dropClient();
    },
  };
}
