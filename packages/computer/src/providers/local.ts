import { join } from 'node:path';
import type { ComputerProvider, ComputerRuntimeRunner, ComputerStatus } from '../provider.js';
import type { CuaDriver } from '../tool/driver.js';
import { localDriverDirectory } from '../tool/local-driver.js';

export interface LocalPermissions {
  readonly accessibility: boolean;
  readonly screenRecording: boolean;
}

export function localPermissions(result: unknown): LocalPermissions {
  const payload = (result as { structuredContent?: Record<string, unknown> })?.structuredContent;
  return {
    accessibility: payload?.accessibility === true,
    screenRecording: payload?.screen_recording === true,
  };
}

export function createLocalComputerProvider(options: {
  driver: CuaDriver;
  runner: ComputerRuntimeRunner;
  dir?: string | undefined;
  platform?: string | undefined;
  onEvent?: ((detail: string) => void) | undefined;
}): ComputerProvider {
  let state: ComputerStatus = { state: 'stopped' };
  let starting: Promise<void> | undefined;
  let controller: AbortController | undefined;
  const supported = (): boolean => (options.platform ?? process.platform) === 'darwin';
  return {
    name: 'local',
    probe: async () => ({
      available: supported(),
      ...(supported()
        ? {}
        : {
            detail:
              'Local Computer requires a macOS DSH Host. Select Container Computer on this Host.',
          }),
    }),
    status: async () => state,
    async start() {
      starting ??= (async () => {
        const started = Date.now();
        controller = new AbortController();
        const signal = controller.signal;
        state = { state: 'stopped', phase: 'starting' };
        try {
          await options.driver.ensure(signal);
          if (signal.aborted) throw new Error('Local Computer setup cancelled');
          const path = join(options.dir ?? localDriverDirectory(), 'cua-driver');
          const doctor = await options.runner.run([
            'env',
            'CUA_DRIVER_RS_TELEMETRY_ENABLED=false',
            'CUA_DRIVER_RS_UPDATE_CHECK=false',
            path,
            'doctor',
            '--json',
          ]);
          if (doctor.code !== 0 || (JSON.parse(doctor.stdout) as { ok?: boolean }).ok !== true)
            throw new Error(
              'Local Computer driver doctor failed. Check the installation and retry.',
            );
          const permissions = localPermissions(
            await options.driver.call('check_permissions', { prompt: false }, signal),
          );
          options.onEvent?.(
            `phase=permissions accessibility=${String(permissions.accessibility)} screenRecording=${String(permissions.screenRecording)} durationMs=${String(Date.now() - started)}`,
          );
          if (!permissions.accessibility || !permissions.screenRecording)
            throw new Error(
              'Allow Accessibility and Screen Recording for the app running DSH in macOS System Settings → Privacy & Security, fully restart that app and DSH, then check again.',
            );
          if (signal.aborted) throw new Error('Local Computer setup cancelled');
          state = { state: 'running', phase: 'running' };
        } catch (error) {
          state = {
            state: 'failed',
            phase: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          };
          options.onEvent?.(`phase=refused detail=${state.detail ?? 'failed'}`);
          await options.driver.close();
          throw error;
        }
      })();
      try {
        await starting;
      } finally {
        starting = undefined;
      }
    },
    async stop() {
      controller?.abort();
      await starting?.catch(() => undefined);
      await options.driver.close();
      state = { state: 'stopped' };
    },
    upstream: () => undefined,
  };
}
