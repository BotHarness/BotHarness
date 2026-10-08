import { useId, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Input,
  Button,
  IconPinFillRegular,
  IconPinOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';
import type { WindowCompanions } from './window-companions.js';
import { WindowCompanionView, type WindowCompanionViewProps } from './window-companion-view.js';
import { CompanionBubbles } from './companion-bubbles.js';

export function CompanionPin({
  companion,
  botId,
  name,
  t,
}: {
  companion: WindowCompanions;
  botId: string;
  name?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const state = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const selected = companion.get(botId) !== undefined;
  const label = t(selected ? 'companion.remove' : 'companion.show');
  return (
    <button
      type="button"
      className="bh-companion-pin"
      disabled={!state.ready}
      aria-label={`${label} · ${name ?? botId}`}
      title={label}
      aria-pressed={selected}
      data-companion-pin={botId}
      onClick={() => {
        if (selected) companion.remove(botId);
        else companion.select(botId);
      }}
    >
      {selected ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />}
    </button>
  );
}

export function WindowCompanionsView({
  companion,
  ...props
}: Omit<WindowCompanionViewProps, 'companion'> & { companion: WindowCompanions }): ReactElement {
  const state = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const [bubbles] = useState(() => new CompanionBubbles());
  return (
    <>
      {state.companions.map((child) => (
        <WindowCompanionView
          key={child.getSnapshot().selection?.botId}
          {...props}
          companion={child}
          bubbles={bubbles}
          onRemove={(botId) => companion.remove(botId)}
        />
      ))}
    </>
  );
}

export function CompanionSettings({
  companion,
  t,
}: {
  companion: WindowCompanions;
  t: BotHarnessTranslate;
}): ReactElement {
  const state = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const id = useId();
  const [error, setError] = useState(false);
  return (
    <form
      className="bh-settings-row bh-companion-settings"
      key={`${state.capacity.layers}:${state.capacity.retention}`}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const layers = Number(data.get('layers'));
        const retention = Number(data.get('retention'));
        if (
          !Number.isInteger(layers) ||
          layers < 1 ||
          layers > 10 ||
          !Number.isInteger(retention) ||
          retention < 1 ||
          retention > 100
        ) {
          setError(true);
          return;
        }
        companion.configureCapacity({ layers, retention });
        setError(false);
      }}
    >
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('companion.settings')}</div>
        <div className="bh-settings-row-desc">{t('companion.capacityHint')}</div>
        {error ? <div role="alert">{t('companion.capacityError')}</div> : null}
      </div>
      <div className="bh-companion-capacity-controls">
        <label htmlFor={`${id}-layers`}>
          {t('companion.layers')}
          <Input
            id={`${id}-layers`}
            name="layers"
            type="number"
            min={1}
            max={10}
            step={1}
            required
            defaultValue={state.capacity.layers}
            disabled={!state.ready}
          />
        </label>
        <label htmlFor={`${id}-retention`}>
          {t('companion.retention')}
          <Input
            id={`${id}-retention`}
            name="retention"
            type="number"
            min={1}
            max={100}
            step={1}
            required
            defaultValue={state.capacity.retention}
            disabled={!state.ready}
          />
        </label>
        <Button type="submit" size="sm" variant="primary" disabled={!state.ready}>
          {t('companion.save')}
        </Button>
      </div>
    </form>
  );
}
