// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingGrant, MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import type { BridgeActions } from '../src/client/actions.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  IconChevronRightOutlineRegular: () => null,
  Modal: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? createElement('div', { role: 'dialog' }, children) : null,
}));

import { MessagingProfile } from '../src/client/messaging-profile.js';
import { zhTranslate } from '../src/client/locale.js';

it('requires explicit target authorization and an explicit send; unknown outcomes survive refresh without resend', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const account = {
    providerId: 'test',
    ref: 'account',
    platform: 'test',
    name: 'Test account',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = { ref: 'self', name: 'Self', digest: 'b'.repeat(64) };
  const grant: MessagingGrant = {
    id: 'grant',
    bindingId: 'binding',
    botSlug: 'ada',
    providerId: 'test',
    accountRef: account.ref,
    accountName: account.name,
    fingerprint: account.fingerprint,
    platform: 'test',
    targetRef: target.ref,
    targetName: target.name,
    targetDigest: target.digest,
    revision: 1,
    createdAt: '2026-10-01T00:00:00Z',
  };
  let snapshot: MessagingSnapshot = { accounts: [account], grants: [], intents: [] };
  const messagingAuthorize = vi.fn(async () => {
    snapshot = { ...snapshot, grants: [{ ...grant, availability: 'available', reception: 'off' }] };
    return grant;
  });
  const messagingSend = vi.fn(
    async (_slug: string, grantId: string, requestId: string, text: string) => {
      expect(grantId).toBe(grant.id);
      expect(requestId.length).toBeGreaterThan(0);
      const intent = {
        id: 'intent',
        botSlug: 'ada',
        grantId,
        grantRevision: 1,
        text,
        state: 'unknown-outcome' as const,
        createdAt: '2026-10-01T00:00:01Z',
      };
      snapshot = { ...snapshot, intents: [intent] };
      return intent;
    },
  );
  const actions: Pick<
    BridgeActions,
    | 'messagingGroupPolicy'
    | 'messagingThreadPolicy'
    | 'messagingReceive'
    | 'messagingChannelTarget'
    | 'messagingSnapshot'
    | 'messagingTargets'
    | 'messagingAuthorize'
    | 'messagingRevoke'
    | 'messagingSend'
  > = {
    messagingThreadPolicy: async () => undefined,
    messagingGroupPolicy: async () => undefined,
    messagingChannelTarget: async () => undefined,
    messagingReceive: async () => undefined,
    messagingSnapshot: async () => snapshot,
    messagingTargets: async () => [target],
    messagingAuthorize,
    messagingRevoke: async () => undefined,
    messagingSend,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => {
    const node = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    if (!node) throw new Error(`missing button ${label}`);
    return node;
  };
  const select = async (label: string, value: string) => {
    const node = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    if (!node) throw new Error(`missing selector ${label}`);
    await act(async () => {
      node.value = value;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  try {
    await act(async () =>
      root.render(createElement(MessagingProfile, { slug: 'ada', actions, t: zhTranslate })),
    );
    expect(messagingAuthorize).not.toHaveBeenCalled();
    expect(messagingSend).not.toHaveBeenCalled();
    expect(button(zhTranslate('im.authorize')).disabled).toBe(true);
    await select(zhTranslate('im.account'), 'test:account');
    await select(zhTranslate('im.target'), 'self');
    expect(messagingAuthorize).not.toHaveBeenCalled();
    await act(async () => button(zhTranslate('im.authorize')).click());
    expect(messagingAuthorize).toHaveBeenCalledWith({
      botSlug: 'ada',
      providerId: 'test',
      accountRef: 'account',
      fingerprint: account.fingerprint,
      targetRef: 'self',
      targetDigest: target.digest,
    });
    expect(messagingSend).not.toHaveBeenCalled();
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('missing message');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        'Hello',
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(zhTranslate('im.send')).click());
    expect(messagingSend).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(zhTranslate('im.unknown'));
    expect(container.textContent).toContain(zhTranslate('im.noRetry'));
    await act(async () => button(zhTranslate('im.refresh')).click());
    expect(messagingSend).toHaveBeenCalledTimes(1);
    snapshot = {
      ...snapshot,
      grants: [{ ...grant, availability: 'rebind-required', reception: 'off' }],
    };
    await act(async () => button(zhTranslate('im.refresh')).click());
    expect(container.textContent).toContain(zhTranslate('im.rebind'));
    expect(button(zhTranslate('im.send')).disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('changes group intake only after the Human toggles it and can stop it when the provider is unavailable', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const grant: MessagingGrant = {
    id: 'group-grant',
    bindingId: 'binding',
    botSlug: 'ada',
    providerId: 'dsh-im',
    accountRef: 'app',
    accountName: 'Own identity',
    fingerprint: 'a'.repeat(64),
    platform: 'feishu',
    targetRef: 'group',
    targetName: 'Work group',
    targetDigest: 'b'.repeat(64),
    revision: 1,
    createdAt: '2026-10-01T00:00:00Z',
  };
  let snapshot: MessagingSnapshot = {
    accounts: [],
    intents: [],
    grants: [{ ...grant, availability: 'available', canReceive: true, reception: 'off' }],
  };
  snapshot.channelTargets = [{ id: 'shared-work', name: 'Shared work' }];
  const messagingChannelTarget = vi.fn(
    async (slug: string, id: string, channelId: string | null) => {
      expect(slug).toBe('ada');
      expect(id).toBe(grant.id);
      snapshot = {
        ...snapshot,
        grants: snapshot.grants.map((item) => {
          const { receiveTargetChannelId: _prior, ...rest } = item;
          return { ...rest, ...(channelId === null ? {} : { receiveTargetChannelId: channelId }) };
        }),
      };
    },
  );
  const messagingReceive = vi.fn(async (slug: string, id: string, enabled: boolean) => {
    expect(slug).toBe('ada');
    expect(id).toBe(grant.id);
    snapshot = {
      ...snapshot,
      grants: [
        {
          ...grant,
          availability: enabled ? 'unavailable' : 'available',
          canReceive: true,
          reception: enabled ? 'unavailable' : 'off',
          ...(enabled
            ? { receiveScope: { kind: 'group', conversationId: 'oc-group' } as const }
            : {}),
        },
      ],
    };
  });
  const messagingSend = vi.fn(async () => {
    throw new Error('unexpected send');
  });
  const actions = {
    messagingThreadPolicy: async () => undefined,
    messagingGroupPolicy: async () => undefined,
    messagingChannelTarget,
    messagingReceive,
    messagingSend,
    messagingSnapshot: async () => snapshot,
    messagingTargets: async () => [],
    messagingAuthorize: async () => grant,
    messagingRevoke: async () => undefined,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (key: 'im.refresh' | 'im.receiveEnable' | 'im.receiveDisable') => {
    const element = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === zhTranslate(key),
    );
    if (!element) throw new Error('button unavailable');
    return element;
  };
  try {
    await act(async () =>
      root.render(createElement(MessagingProfile, { slug: 'ada', actions, t: zhTranslate })),
    );
    await act(async () => button('im.refresh').click());
    expect(messagingReceive).not.toHaveBeenCalled();
    expect(messagingChannelTarget).not.toHaveBeenCalled();
    const selector = container.querySelector<HTMLSelectElement>(
      `select[aria-label="${zhTranslate('im.localTarget')}"]`,
    )!;
    expect(selector.value).toBe('');
    expect(selector.options.length).toBe(2);
    await act(async () => {
      selector.value = 'shared-work';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(messagingChannelTarget.mock.calls).toEqual([['ada', grant.id, 'shared-work']]);
    expect(container.textContent).toContain(zhTranslate('im.channelTargetHint'));
    expect(messagingReceive).not.toHaveBeenCalled();
    expect(messagingSend).not.toHaveBeenCalled();
    await act(async () => {
      selector.value = '';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(messagingChannelTarget.mock.calls).toEqual([
      ['ada', grant.id, 'shared-work'],
      ['ada', grant.id, null],
    ]);
    await act(async () => button('im.receiveEnable').click());
    expect(messagingReceive.mock.calls).toEqual([['ada', grant.id, true]]);
    expect(button('im.receiveDisable').disabled).toBe(false);
    await act(async () => button('im.receiveDisable').click());
    expect(messagingReceive.mock.calls).toEqual([
      ['ada', grant.id, true],
      ['ada', grant.id, false],
    ]);
    expect(button('im.receiveEnable').disabled).toBe(false);
    expect(messagingSend).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('gates full collection on live ordinary delivery and saves collection independently from wake through Host actions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const grant: MessagingGrant = {
    id: 'policy-grant',
    bindingId: 'binding',
    botSlug: 'ada',
    providerId: 'test',
    accountRef: 'account',
    accountName: 'My identity',
    fingerprint: 'a'.repeat(64),
    platform: 'test',
    targetRef: 'group',
    targetName: 'Authorized group',
    targetDigest: 'b'.repeat(64),
    revision: 2,
    createdAt: '2026-10-01T00:00:00Z',
    receiveScope: { kind: 'group', conversationId: 'oc-group' },
  };
  let verified = false;
  const policy = {
    collection: 'mentions' as const,
    wake: 'digest' as const,
    count: 5,
    intervalSeconds: 30,
    revision: 0,
    changedAt: '',
    editor: { kind: 'built-in' as const },
  };
  const messagingGroupPolicy = vi.fn(async () => undefined);
  const actions = {
    messagingGroupPolicy,
    messagingThreadPolicy: async () => undefined,
    messagingReceive: async () => undefined,
    messagingChannelTarget: async () => undefined,
    messagingSnapshot: async (): Promise<MessagingSnapshot> => ({
      accounts: [],
      intents: [],
      grants: [
        {
          ...grant,
          canReceive: true,
          availability: 'available',
          reception: 'receiving',
          ordinaryDelivery: verified ? 'verified' : 'unverified',
          groupPolicy: policy,
        },
      ],
    }),
    messagingTargets: async () => [],
    messagingAuthorize: async () => grant,
    messagingRevoke: async () => undefined,
    messagingSend: async () => {
      throw new Error('Must not send');
    },
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (key: 'im.refresh' | 'im.policySave') =>
    [...container.querySelectorAll('button')].find(
      (item) => item.textContent === zhTranslate(key),
    )!;
  try {
    await act(async () =>
      root.render(createElement(MessagingProfile, { slug: 'ada', actions, t: zhTranslate })),
    );
    await act(async () => button('im.refresh').click());
    const collection = container.querySelector<HTMLSelectElement>(
      `select[aria-label="${zhTranslate('im.collection')}"]`,
    )!;
    expect(collection.querySelector<HTMLOptionElement>('option[value="all"]')?.disabled).toBe(true);
    expect(container.textContent).toContain(zhTranslate('im.ordinaryUnverified'));
    verified = true;
    await act(async () => button('im.refresh').click());
    expect(collection.querySelector<HTMLOptionElement>('option[value="all"]')?.disabled).toBe(
      false,
    );
    await act(async () => {
      collection.value = 'all';
      collection.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const wake = container.querySelector<HTMLSelectElement>(
      `select[aria-label="${zhTranslate('im.ordinaryWake')}"]`,
    )!;
    await act(async () => {
      wake.value = 'immediate';
      wake.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(messagingGroupPolicy).not.toHaveBeenCalled();
    await act(async () => button('im.policySave').click());
    expect(messagingGroupPolicy).toHaveBeenCalledExactlyOnceWith('ada', grant.id, {
      collection: 'all',
      wake: 'immediate',
      count: 5,
      intervalSeconds: 30,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('shows per-Thread state, refuses unverified follow and saves the exact Human revision from the Modal', async () => {
  const { ThreadReceptionSettings } = await import('../src/client/thread-reception-settings.js');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let verified = false;
  const save = vi.fn(async () => true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    root.render(
      createElement(ThreadReceptionSettings, {
        policies: [
          {
            threadId: 'omt-topic',
            conversationId: 'oc-team',
            rootId: 'om-root',
            anchorSourceEventId: 'source-one',
            fingerprint: 'a'.repeat(64),
            mode: 'inherit',
            revision: 7,
            wake: null,
            changedAt: '',
            editor: { kind: 'bot', botSlug: 'ada' },
            ordinaryDelivery: verified ? 'verified' : 'unverified',
            preview: 'Test Thread message',
          },
        ],
        busy: false,
        t: zhTranslate,
        save,
      }),
    );
  const manage = () =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('im.threadManage'),
    )!;
  const mode = () => container.querySelector<HTMLSelectElement>('[role="dialog"] select')!;
  const submit = () =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('im.threadSave'),
    )!;
  try {
    await act(async () => render());
    expect(container.querySelector('table')?.textContent).toContain('Test Thread message');
    await act(async () => manage().click());
    await act(async () => {
      mode().value = 'follow';
      mode().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(submit().disabled).toBe(true);
    expect(container.textContent).toContain(zhTranslate('im.threadUnverified'));
    verified = true;
    await act(async () => render());
    await act(async () => manage().click());
    await act(async () => {
      mode().value = 'follow';
      mode().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(submit().disabled).toBe(false);
    await act(async () => submit().click());
    expect(save).toHaveBeenCalledExactlyOnceWith('source-one', {
      mode: 'follow',
      expectedRevision: 7,
      wake: null,
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
