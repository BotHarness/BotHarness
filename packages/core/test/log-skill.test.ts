import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  LOGS_SKILL_CONTENT,
  LOGS_SKILL_DESCRIPTION,
  LOGS_SKILL_INVOCATION,
  LOGS_SKILL_NAME,
  LOGS_SKILL_PROVIDER,
  LOGS_SKILL_SOURCE,
  LOGS_SKILL_WHEN_TO_USE,
} from '../src/logs/skill.js';

const GUIDE_PATH = new URL('../../../docs/dev/guides/reading-operational-logs.md', import.meta.url);

describe('operational logs skill', () => {
  it('uses a kebab-case name with a catalog-sized description', () => {
    expect(LOGS_SKILL_NAME).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(LOGS_SKILL_DESCRIPTION.length).toBeGreaterThan(0);
    expect(LOGS_SKILL_DESCRIPTION.length).toBeLessThanOrEqual(500);
    expect(LOGS_SKILL_WHEN_TO_USE.length).toBeGreaterThan(0);
  });

  it('is model-only: never a Human command-palette entry', () => {
    expect(LOGS_SKILL_INVOCATION).toEqual({ modelInvocable: true, userInvocable: false });
  });

  it('carries loader-required source and provider strings', () => {
    expect(typeof LOGS_SKILL_SOURCE).toBe('string');
    expect(LOGS_SKILL_SOURCE.length).toBeGreaterThan(0);
    expect(typeof LOGS_SKILL_PROVIDER).toBe('string');
    expect(LOGS_SKILL_PROVIDER.length).toBeGreaterThan(0);
  });

  it('registers the guide text without content drift across checkout line endings', () => {
    expect(LOGS_SKILL_CONTENT).toBe(readFileSync(GUIDE_PATH, 'utf8').replace(/\r\n/g, '\n'));
  });
});
