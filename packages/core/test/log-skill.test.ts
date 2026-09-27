import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DeveloperModeSkillGate,
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

  it('is model- and Human-invocable: the dev-mode gate (not the flags) hides it', () => {
    expect(LOGS_SKILL_INVOCATION).toEqual({ modelInvocable: true, userInvocable: true });
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

describe('DeveloperModeSkillGate', () => {
  function registrar() {
    const calls: unknown[] = [];
    const disposed: string[] = [];
    return {
      calls,
      disposed,
      register: (definition: { name: string }) => {
        calls.push(definition);
        return () => {
          disposed.push(definition.name);
        };
      },
    };
  }

  it('starts off with nothing registered', () => {
    const skills = registrar();
    const gate = new DeveloperModeSkillGate(skills);
    expect(gate.active).toBe(false);
    expect(skills.calls).toEqual([]);
  });

  it('registers on enable and disposes on disable, idempotently', () => {
    const skills = registrar();
    const gate = new DeveloperModeSkillGate(skills);
    gate.set(true);
    gate.set(true);
    expect(skills.calls).toHaveLength(1);
    expect(gate.active).toBe(true);
    gate.set(false);
    gate.set(false);
    expect(skills.disposed).toEqual(['reading-operational-logs']);
    expect(gate.active).toBe(false);
  });

  it('re-registers after an off/on cycle', () => {
    const skills = registrar();
    const gate = new DeveloperModeSkillGate(skills);
    gate.set(true);
    gate.set(false);
    gate.set(true);
    expect(skills.calls).toHaveLength(2);
    expect(skills.disposed).toHaveLength(1);
  });
});
