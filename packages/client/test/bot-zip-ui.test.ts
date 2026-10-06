// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  IconCloseOutlineRegular: () => createElement('span'),
  SegmentedControl: () => createElement('span'),
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
  Modal: (props: {
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    createElement(
      'section',
      { role: 'dialog' },
      createElement('h1', null, props.title),
      createElement('p', null, props.description),
      props.children,
      props.footer,
    ),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { BotZipExportSection, botZipError, ImportBotZipModal } from '../src/client/bot-zip.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import type { BotSummary } from '../src/client/store.js';

const enTranslate: BotHarnessTranslate = (key, params) => {
  const english: Readonly<Record<string, string>> = en;
  let text: string = english[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replaceAll('{' + name + '}', String(value));
  return text;
};

const mounted: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
});

async function mount(element: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return host;
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent === text);
  if (found === undefined) throw new Error(`No button ${text}`);
  return found;
}

async function chooseFile(host: HTMLElement, file: File): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.accept).toBe('.zip,application/zip');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

const BOT = { slug: 'ada', displayName: 'Ada' } as BotSummary;

describe('Import from zip', () => {
  it('shows the third-party notice and imports the chosen zip into the section', async () => {
    const importBotZip = vi.fn(async () => BOT);
    const onImported = vi.fn();
    const host = await mount(
      createElement(ImportBotZipModal, {
        actions: { importBotZip } as unknown as BridgeActions,
        sectionId: 'section-work',
        sectionName: '工作流',
        t: zhTranslate,
        onCancel: vi.fn(),
        onImported,
      }),
    );

    expect(host.textContent).toContain('在「工作流」中从 zip 导入 PersonaBot');
    expect(host.textContent).toContain('这是第三方内容');
    expect(host.textContent).toContain('还没有选择文件');
    expect(button(host, '导入').disabled).toBe(true);

    const file = new File([new Uint8Array([0x50, 0x4b])], 'Ada.zip', { type: 'application/zip' });
    await chooseFile(host, file);
    expect(host.textContent).toContain('Ada.zip');
    await act(async () => button(host, '导入').click());

    expect(importBotZip).toHaveBeenCalledWith(file, 'section-work');
    expect(onImported).toHaveBeenCalled();
  });

  it('keeps the dialog open with a clear reason when the Host refuses the zip', async () => {
    const importBotZip = vi.fn(async () => {
      throw new BridgeCallError('unsafe-path', 'Unsafe entry path: ../evil.md');
    });
    const host = await mount(
      createElement(ImportBotZipModal, {
        actions: { importBotZip } as unknown as BridgeActions,
        t: enTranslate,
        onCancel: vi.fn(),
        onImported: vi.fn(),
      }),
    );
    await chooseFile(host, new File(['x'], 'evil.zip'));
    await act(async () => button(host, 'Import').click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('unsafe paths');
    expect(host.textContent).not.toContain('../evil.md');
  });

  it('maps every Bot Zip refusal to copy that names the problem', () => {
    expect(botZipError(new BridgeCallError('invalid-zip', 'x'), zhTranslate)).toContain('zip');
    expect(botZipError(new BridgeCallError('too-large', 'x'), zhTranslate)).toContain('100 MB');
    expect(botZipError(new BridgeCallError('empty', 'x'), zhTranslate)).toBe('zip 里没有文件。');
  });
});

describe('Export zip', () => {
  it('reminds about secrets before downloading the whole Bot', async () => {
    const exportBotZip = vi.fn(async () => undefined);
    const host = await mount(
      createElement(BotZipExportSection, {
        bot: BOT,
        actions: { exportBotZip } as unknown as BridgeActions,
        t: zhTranslate,
      }),
    );

    expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('分享与导出');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button(host, '导出 zip').click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('导出 Ada');
    expect(host.textContent).toContain('分享前请先检查');
    expect(host.textContent).toContain('API Key');
    expect(exportBotZip).not.toHaveBeenCalled();

    await act(async () => button(host, '导出').click());
    expect(exportBotZip).toHaveBeenCalledWith('ada', 'Ada');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});
