import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  Modal: (props: {
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    createElement(
      'section',
      null,
      createElement('h1', null, props.title),
      createElement('p', null, props.description),
      props.children,
      props.footer,
    ),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { CreatePersonaBotModal, personaBotCreateError } from '../src/client/persona-bot-create.js';

describe('PersonaBot creation form', () => {
  it('renders the three-field first slice and keeps submit disabled initially', () => {
    const markup = renderToStaticMarkup(
      createElement(CreatePersonaBotModal, {
        actions: { createBot: vi.fn() } as unknown as BridgeActions,
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );

    expect(markup).toContain('创建 PersonaBot');
    expect(markup).toContain('名称');
    expect(markup).toContain('placeholder="research-assistant"');
    expect(markup).toContain('Persona');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('<button disabled="">创建</button>');
  });

  it('turns stable Host error codes into actionable inline copy', () => {
    expect(personaBotCreateError(new BridgeCallError('invalid-slug', 'bad'))).toContain(
      '小写英文字母',
    );
    expect(personaBotCreateError(new BridgeCallError('duplicate', 'exists'))).toBe(
      '这个标识已被使用。',
    );
    expect(personaBotCreateError(new Error('disk read-only'))).toBe('disk read-only');
  });
});
