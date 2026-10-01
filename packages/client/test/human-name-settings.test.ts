// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { installBotNavIcon } from '../src/client/bot-icon-nav.js';
import { openBotSettings } from '../src/client/bot-settings-open.js';

describe('Human name settings navigation', () => {
  it('keeps the same icon DOM when the navigation observer reapplies unchanged markup', () => {
    vi.stubGlobal('MutationObserver', undefined);
    const button = document.createElement('button');
    button.innerHTML = '<svg></svg><span>Bot 设置</span>';
    document.body.append(button);
    let refresh: (() => void) | undefined;
    const dispose = installBotNavIcon({
      root: document,
      labels: () => ['Bot 设置'],
      markup: () => '<svg></svg>',
      subscribe(listener) {
        refresh = listener;
        return () => {};
      },
    });
    const original = button.querySelector('.bh-bot-nav-icon')?.firstElementChild;
    return Promise.resolve()
      .then(() => {
        refresh?.();
        return Promise.resolve();
      })
      .then(() => {
        expect(button.querySelector('.bh-bot-nav-icon')?.firstElementChild).toBe(original);
      })
      .finally(() => {
        dispose();
        button.remove();
        vi.unstubAllGlobals();
      });
  });

  it('reopens Bot settings after its own navigation icon is installed', () => {
    const button = document.createElement('button');
    button.innerHTML = '<svg></svg><span>Bot 设置</span>';
    document.body.append(button);
    let selected = 0;
    button.addEventListener('click', () => (selected += 1));
    const dispose = installBotNavIcon({
      root: document,
      labels: () => ['Bot 设置'],
      markup: () => '<svg></svg>',
    });
    try {
      openBotSettings(() => ['Bot 设置'], document);
      openBotSettings(() => ['Bot 设置'], document);
      expect(selected).toBe(2);
    } finally {
      dispose();
      button.remove();
    }
  });
});
