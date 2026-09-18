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
    expect(required.every((id) => id === 'react' || id?.startsWith('react/'))).toBe(true);
    expect(bundleCode).not.toContain('require("@deepseek-ai/');
  });

  it('exposes the plugin and registers the roster panel plus the @ mention source', () => {
    const plugin = loadedEntry().factory((id) => requireFromTest(id));
    expect(plugin['name']).toBe('botharness-client');
    expect(plugin['inject']).toEqual(['slots', 'connection', 'inputTriggers']);

    const registered: string[] = [];
    const sources: unknown[] = [];
    const scoped = {
      slots: {
        inject: (_name: string, callback: () => unknown) => callback(),
        register: (spec: { name: string }) => {
          registered.push(spec.name);
          return () => undefined;
        },
      },
      connection: {
        rpc: {
          call: async () => ({ ok: true, value: { bots: [] } }),
        },
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

    expect(registered).toEqual(['sidebar.panellist', 'main']);
    expect(sources).toHaveLength(1);
    expect((sources[0] as { trigger?: string }).trigger).toBe('@');
  });
});
