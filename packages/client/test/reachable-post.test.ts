// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Modal: ({ open, children, footer }: PropsWithChildren<{ open: boolean; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog' }, children, footer) : null,
}));
import { ReachablePostDialog } from '../src/client/reachable-post.js';
import { zhTranslate } from '../src/client/locale.js';
import { chooseOption } from './primitive-mocks.js';

it('Profile chooses a native group and keeps an unknown outcome from being sent twice', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const posts: string[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(ReachablePostDialog, {
          slug: 'ada',
          identity: {
            id: 'binding',
            botSlug: 'ada',
            providerId: 'dsh-im/feishu',
            platform: 'feishu',
            accountRef: 'qa',
            fingerprint: 'a'.repeat(64),
            name: 'QA app',
            enabled: true,
            revision: 1,
            newConversations: 'auto',
            createdAt: '2026-10-09T00:00:00Z',
            availability: 'available',
            grantCount: 0,
            scopes: [],
          },
          t: zhTranslate,
          onClose: () => {},
          refresh: async () => {},
          actions: {
            messagingReachable: async () => ({
              version: 1 as const,
              conversations: [{ id: 'oc_new', kind: 'group' as const, name: 'New QA group' }],
              hasMore: false,
            }),
            messagingPostConversation: async (_slug, _binding, _group, _request, text) => {
              posts.push(text);
              return {
                id: 'intent',
                botSlug: 'ada',
                grantId: 'grant',
                grantRevision: 1,
                text,
                state: 'unknown-outcome',
                createdAt: '2026-10-09T00:00:00Z',
              };
            },
            messagingPostLimit: async () => {},
          },
        }),
      ),
    );

    await chooseOption('选择群聊', 'oc_new', host);
    const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(input, 'One report');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (value) => value.textContent === '主动发送',
    )!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(document.body.textContent).toContain('结果未知');
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(posts).toEqual(['One report']);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
