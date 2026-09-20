import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  IconCloseOutline16: () => createElement('span'),
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
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
import {
  CreatePersonaBotModal,
  normalizeRoleBadges,
  personaBotCreateError,
} from '../src/client/persona-bot-create.js';

describe('PersonaBot creation form', () => {
  it('asks for the Human-facing name, optional role badges, and an optional description', () => {
    const markup = renderToStaticMarkup(
      createElement(CreatePersonaBotModal, {
        actions: { createBot: vi.fn() } as unknown as BridgeActions,
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );

    expect(markup).toContain('创建 PersonaBot');
    expect(markup).toContain('名称用于列表和 @；内部身份由系统生成');
    expect(markup).toContain('岗位 / 职位（可选）');
    expect(markup).toContain('简介（可选）');
    expect(markup).toContain('placeholder="例如：小研"');
    expect(markup).toContain('placeholder="例如：研究员"');
    expect(markup).toContain('placeholder="例如：负责代码审查与质量把关"');
    expect(markup).not.toContain('标识');
    expect(markup).not.toContain('Persona</');
    expect(markup).not.toContain('<textarea');
    expect(markup).toContain('<button disabled="">创建</button>');
  });

  it('normalizes, de-duplicates, and drops blank role badges', () => {
    expect(normalizeRoleBadges([' 研究员 ', '写作', '研究员', ' '])).toEqual(['研究员', '写作']);
  });

  it('turns stable Host errors into actionable inline copy without exposing IDs', () => {
    expect(personaBotCreateError(new BridgeCallError('invalid-input', 'bad'))).toBe(
      '请检查 BOT 名称、岗位或简介。',
    );
    expect(personaBotCreateError(new BridgeCallError('duplicate', 'exists'))).toBe(
      '系统未能分配唯一身份，请重试。',
    );
    expect(personaBotCreateError(new Error('disk read-only'))).toBe('disk read-only');
  });
});
