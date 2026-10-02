import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BrowserClientContext } from './index.js';
import { LOCALE_NS, type BrowserTranslate } from './locale.js';

interface TargetScope {
  getSnapshot(): {
    status: string;
    writable: boolean;
    value: { target?: 'local' | 'container' } | undefined;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

export function BrowserTargetSettings({
  scope,
  t,
}: {
  scope: TargetScope;
  t: BrowserTranslate;
}): ReactElement {
  const store = useMemo(
    () => ({
      subscribe: (listener: () => void) => scope.subscribe(listener),
      getSnapshot: () => scope.getSnapshot(),
    }),
    [scope],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const target = snapshot.value?.target ?? 'local';
  return (
    <div className="bh-settings-rows bh-browser-settings">
      <div className="bh-settings-section-head">
        <div className="bh-settings-section-title">Browser</div>
      </div>
      <div className="bh-settings-row">
        <div className="bh-settings-row-title">{t('settings.target')}</div>
        <Menu
          portal
          align="end"
          open={open}
          selectedId={target}
          items={(['local', 'container'] as const).map((id) => ({
            id,
            label: t(`settings.${id}`),
          }))}
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            setOpen(false);
            if (id !== 'local' && id !== 'container') return;
            setSaving(true);
            setError(undefined);
            void scope
              .set('target', id)
              .then(() => {
                if (scope.getSnapshot().value?.target !== id)
                  throw new Error('Browser Target was not saved');
              })
              .catch((cause: unknown) => setError(String(cause)))
              .finally(() => setSaving(false));
          }}
          anchor={
            <button
              type="button"
              className="bh-settings-selector"
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={!snapshot.writable || saving}
              onClick={() => setOpen(!open)}
            >
              {t(`settings.${target}`)}
              <IconChevronDownOutlineRegular />
            </button>
          }
        />
      </div>
      {error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {error}
        </div>
      )}
    </div>
  );
}

export function registerBrowserSettings(ctx: BrowserClientContext, t: BrowserTranslate): void {
  ctx.inject(['configForms', 'slots'], (settingsCtx) => {
    const native = settingsCtx as unknown as {
      configForms: { get(namespace: string): TargetScope };
      slots: {
        inject(name: string, callback: () => unknown): () => void;
        register(
          options: {
            name: string;
            id: string;
            order: number;
            locale: string;
            inject: () => { scope: TargetScope; t: BrowserTranslate };
          },
          component: typeof BrowserTargetSettings,
        ): () => void;
      };
    };
    const scope = native.configForms.get('botharness-browser');
    return native.slots.inject('botharness.settings.item', () =>
      native.slots.register(
        {
          name: 'botharness.settings.item',
          id: 'browser',
          order: 11,
          locale: LOCALE_NS,
          inject: () => ({ scope, t }),
        },
        BrowserTargetSettings,
      ),
    );
  });
}
