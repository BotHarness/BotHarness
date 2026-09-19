import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import { build } from 'tsdown';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clientBundleOptions } from '../../../tsdown.config.js';

interface LoadedEntry {
  id: string;
  factory: (require: (id: string) => unknown) => Record<string, unknown>;
}

const requireFromTest = createRequire(import.meta.url);
const tempDir = mkdtempSync(join(tmpdir(), 'botharness-client-bundle-'));

const BASELINE_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]);

function isBaselineModule(id: string): boolean {
  return BASELINE_MODULES.has(id) || id.startsWith('react/');
}

function baselineModuleStub(): Record<string, unknown> {
  const stub: Record<string, unknown> = {};
  return new Proxy(stub, {
    get: (target, property) => {
      if (typeof property !== 'string') return undefined;
      if (!(property in target)) target[property] = () => null;
      return target[property];
    },
  });
}

const shellRequire = (id: string): unknown =>
  id.startsWith('@deepseek-ai/') ? baselineModuleStub() : requireFromTest(id);

let bundleCode = '';
let entry: LoadedEntry | undefined;

function loadedEntry(): LoadedEntry {
  if (entry === undefined) throw new Error('the bundle did not call __ModuleLoader__.load');
  return entry;
}

beforeAll(async () => {
  await build({ ...clientBundleOptions, outDir: tempDir });
  bundleCode = readFileSync(join(tempDir, 'client.js'), 'utf8');
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (loaded: LoadedEntry) => {
          entry = loaded;
        },
      },
    },
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    console,
  };
  vm.createContext(sandbox);
  new vm.Script(bundleCode, { filename: 'client.js' }).runInContext(sandbox);
}, 60_000);

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('@botharness/client browser bundle', () => {
  it('self-registers with the lazy-CJS module-loader contract', () => {
    const loaded = loadedEntry();
    expect(loaded.id).toBe('@botharness/client');
    expect(loaded.factory).toBeTypeOf('function');
  });

  it('externalizes the shell baseline and inlines everything else', () => {
    const required = [...bundleCode.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(required.length).toBeGreaterThan(0);
    expect(required.every((id) => id !== undefined && isBaselineModule(id))).toBe(true);
    expect(required).toContain('@deepseek-ai/dsh-client-ui-primitives');
    const nonBaselineShell = required.filter(
      (id) => typeof id === 'string' && id.startsWith('@deepseek-ai/') && !BASELINE_MODULES.has(id),
    );
    expect(nonBaselineShell).toEqual([]);
  });

  it('exposes the plugin and registers the bot-mode panel plus the @ mention source', () => {
    const plugin = loadedEntry().factory(shellRequire);
    expect(plugin['name']).toBe('botharness-client');
    expect(plugin['inject']).toEqual(['slots', 'connection', 'inputTriggers']);

    const registered: {
      name: string;
      id?: string;
      key?: string;
      order?: number;
      label?: string;
    }[] = [];
    const sources: unknown[] = [];
    const scoped = {
      slots: {
        inject: (_name: string, callback: () => unknown) => callback(),
        register: (spec: {
          name: string;
          id?: string;
          key?: string;
          order?: number;
          label?: string;
        }) => {
          registered.push(spec);
          return () => undefined;
        },
      },
      connection: {
        rpc: {
          call: async () => ({ ok: true, value: { bots: [] } }),
        },
      },
      layout: {
        selectPanel: () => undefined,
      },
      inputTriggers: {
        registerSource: (source: unknown) => {
          sources.push(source);
          return () => undefined;
        },
      },
      effect: (callback: () => unknown) => {
        callback();
        return () => undefined;
      },
    };

    (plugin['apply'] as (ctx: unknown) => void)(scoped);

    expect(registered).toEqual([
      { name: 'sidebar.panellist', id: 'botharness', order: 10, label: 'BOT 模式' },
      {
        name: 'main',
        key: 'botharness',
        inject: expect.any(Function),
      },
    ]);
    expect(sources).toHaveLength(1);
    expect((sources[0] as { trigger?: string }).trigger).toBe('@');
  });
});
