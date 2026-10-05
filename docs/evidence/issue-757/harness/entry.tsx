import { createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PersonaBotAvatar } from '../../../../packages/client/src/client/avatar.js';
import {
  AVATAR_PRESETS,
  DEFAULT_ILLUSTRATED_RECIPE,
  detailedAvatarRecipe,
} from '../../../../packages/core/src/bots/avatar-appearance.js';
import { LINE_PRESETS } from '../../../../packages/core/src/bots/avatar-line.js';
import { CSS } from '../../../../packages/client/src/client/styles.js';

const TOOLS = [
  'read',
  'grep',
  'edit',
  'bash',
  'web_search',
  'todo_write',
  'ask_user_question',
  'subagent',
];
const extreme = detailedAvatarRecipe({
  ...DEFAULT_ILLUSTRATED_RECIPE,
  hair: 'twintails',
  pose: 'right',
  accessory: AVATAR_PRESETS[3]!.accessory,
});
const RECIPES = [
  ...AVATAR_PRESETS,
  ...LINE_PRESETS,
  { ...extreme, spacing: 1, height: -1, hairLength: 2 },
  { ...extreme, spacing: -1, height: 1, hairLength: -2, pose: 'left' as const },
];

interface Config {
  count: number;
  size: number;
  sameBot: boolean;
  intervalMs: number;
  indicator?: boolean;
  family?: 'line' | 'illustrated';
  column?: boolean;
}

function Grid({ config }: { config: Config }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!config.intervalMs) return;
    const id = setInterval(() => setTick((t) => t + 1), config.intervalMs);
    return () => clearInterval(id);
  }, [config.intervalMs]);
  return createElement(
    'div',
    config.column
      ? {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '6px',
            width: '260px',
          },
        }
      : { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px' } },
    Array.from({ length: config.count }, (_, i) => {
      const pool = config.family ? RECIPES.filter((r) => r.family === config.family) : RECIPES;
      const recipe = config.sameBot ? pool[0]! : pool[i % pool.length]!;
      const phase = (tick + i) % (TOOLS.length + 2);
      const state =
        phase === TOOLS.length ? 'thinking' : phase === TOOLS.length + 1 ? 'idle' : 'working';
      return createElement(PersonaBotAvatar, {
        key: i,
        personaBotId: config.sameBot ? 'same' : `bot-${i}`,
        name: `Bot ${i}`,
        appearance: { recipe, revision: 'a'.repeat(64) },
        size: config.size,
        indicator: config.indicator ?? false,
        state,
        ...(state === 'working'
          ? {
              activity: {
                effect: 'generic-working' as const,
                toolKind: 'other' as const,
                toolName: TOOLS[phase]!,
                startedAt: 0,
                activeToolCount: 1,
              },
            }
          : {}),
        ...(i % 5 === 0 ? { attention: { approvalCount: 1 } } : {}),
      });
    }),
  );
}

const style = document.createElement('style');
style.textContent = CSS;
document.head.append(style);
let root: Root | undefined;
Object.assign(window, {
  mountGrid(config: Config) {
    root?.unmount();
    const host = document.getElementById('app')!;
    root = createRoot(host);
    root.render(createElement(Grid, { config }));
  },
  unmountGrid() {
    root?.unmount();
    root = undefined;
  },
});

function Sheet({ dark }: { dark: boolean }) {
  const sizes = [18, 24, 40, 96];
  const fg = dark ? '#e8e8e8' : '#222';
  return createElement(
    'div',
    {
      style: {
        background: dark ? '#1b1b1f' : '#ffffff',
        color: fg,
        padding: '12px',
        font: '12px system-ui',
      },
    },
    createElement('div', { style: { marginBottom: '8px' } }, dark ? 'Dark' : 'Light'),
    ...sizes.map((size) =>
      createElement(
        'div',
        {
          key: size,
          style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
        },
        createElement('span', { style: { width: '36px' } }, `${size}px`),
        ...RECIPES.map((recipe, i) =>
          createElement(PersonaBotAvatar, {
            key: i,
            personaBotId: `s-${i}`,
            name: `Bot ${i}`,
            appearance: { recipe, revision: 'a'.repeat(64) },
            size,
            state: i % 3 === 1 ? 'working' : 'idle',
            indicator: false,
            ...(i % 3 === 1
              ? {
                  activity: {
                    effect: 'generic-working' as const,
                    toolKind: 'other' as const,
                    toolName: TOOLS[i % TOOLS.length]!,
                    startedAt: 0,
                    activeToolCount: 1,
                  },
                }
              : {}),
          }),
        ),
      ),
    ),
  );
}
Object.assign(window, {
  mountSheet() {
    root?.unmount();
    document.documentElement.dataset.botharnessMotion = 'reduce';
    root = createRoot(document.getElementById('app')!);
    root.render(
      createElement(
        'div',
        null,
        createElement(Sheet, { dark: false }),
        createElement(Sheet, { dark: true }),
      ),
    );
  },
});
