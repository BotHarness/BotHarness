// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  IconSendOutlineRegular: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import { deleteSelectedMention } from '../src/client/mentions.js';
import {
  insertRichPlainText,
  readRichMentionDraft,
  renderRichMentionDraft,
  richSelectionOffsets,
  setRichSelection,
} from '../src/client/rich-mention-editor.js';

describe('rich mention editor', () => {
  it('renders the same avatar badge inside the live Group composer', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '@Ada hello',
            mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
            mentionCandidates: [
              {
                slug: 'ada',
                displayName: 'Ada',
                avatar: '/avatars/ada.png',
                roles: [],
                aggregateState: 'idle',
                workspaces: [],
                createdAt: '2026-09-25T00:00:00.000Z',
              },
            ],
            placeholder: 'Message',
            sending: false,
            onChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
      });
      const editor = container.querySelector<HTMLElement>('.bh-composer-rich-input');
      const badge = editor?.querySelector<HTMLElement>('.bh-composer-inline-mention');
      expect(editor?.textContent).toBe('Ada hello');
      expect(badge?.textContent).toBe('Ada');
      expect(badge?.querySelector('img')?.getAttribute('src')).toBe('/avatars/ada.png');
      expect(editor?.querySelector('textarea')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows names without @ while round-tripping stable IDs and raw offsets', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const value = '@Ada hi @Bea';
    const mentions = [
      { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
      { botSlug: 'bea', label: 'Bea', start: 8, end: 12 },
    ];
    const mounts = renderRichMentionDraft(editor, value, mentions, []);
    expect(editor.textContent).toBe('Ada hi Bea');
    expect(mounts.map((item) => item.botSlug)).toEqual(['ada', 'bea']);
    expect(readRichMentionDraft(editor)).toEqual({ value, mentions });

    setRichSelection(editor, 4);
    expect(richSelectionOffsets(editor)).toEqual({ start: 4, end: 4 });
    insertRichPlainText(editor, ' there');
    expect(readRichMentionDraft(editor)).toEqual({
      value: '@Ada there hi @Bea',
      mentions: [mentions[0], { botSlug: 'bea', label: 'Bea', start: 14, end: 18 }],
    });
    editor.remove();
  });

  it('keeps pasted @text plain and removes a selected token as one unit', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const mention = { botSlug: 'ada', label: 'Ada', start: 0, end: 4 };
    renderRichMentionDraft(editor, '@Ada hello', [mention], []);
    setRichSelection(editor, 10);
    insertRichPlainText(editor, ' @NotSelected');
    const draft = readRichMentionDraft(editor);
    expect(draft.value).toBe('@Ada hello @NotSelected');
    expect(draft.mentions).toEqual([mention]);
    expect(deleteSelectedMention(draft.value, draft.mentions, 5, 5, 'Backspace')).toEqual({
      value: 'hello @NotSelected',
      mentions: [],
      caret: 0,
    });
    editor.remove();
  });
});
