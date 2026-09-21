import { describe, expect, it, vi } from 'vitest';

import { rosterDomainSpec, rosterDomainState, rosterSectionRecord } from '../src/roster/spec.js';
import {
  createRosterStore,
  RosterUnavailableError,
  RosterUnknownSectionError,
} from '../src/roster/store.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('roster domain spec', () => {
  it('declares the botharness_roster identity on the default layout', () => {
    expect(rosterDomainSpec.name).toBe('botharness_roster');
    expect(rosterDomainSpec.version).toBe(1);
    expect(rosterDomainSpec.layout).toBe('single');
    expect(Object.keys(rosterDomainSpec.tables)).toEqual(['sections']);
  });

  it('validates the global singleton and rejects null', () => {
    expect(rosterDomainState.parse({ pins: ['ada'], sectionOrder: ['s1'] })).toEqual({
      pins: ['ada'],
      sectionOrder: ['s1'],
    });
    expect(rosterDomainState.safeParse(null).success).toBe(false);
    expect(rosterDomainState.safeParse({ pins: [], sectionOrder: 'nope' }).success).toBe(false);
    expect(rosterDomainState.safeParse({ pins: 'ada', sectionOrder: [] }).success).toBe(false);
  });

  it('validates section records', () => {
    expect(rosterSectionRecord.parse({ name: '研究', channelIds: ['c1'] })).toEqual({
      name: '研究',
      channelIds: ['c1'],
    });
    expect(rosterSectionRecord.safeParse({ name: '研究' }).success).toBe(false);
    expect(rosterSectionRecord.safeParse({ name: '研究', channelIds: [1] }).success).toBe(false);
  });
});

describe('roster store', () => {
  it('reports storage-unavailable for reads and writes and warns once without a domain', async () => {
    const warn = vi.fn();
    const store = createRosterStore({ warn });

    expect(store.available).toBe(false);
    expect(() => store.snapshot()).toThrow(RosterUnavailableError);
    await expect(store.sectionCreate('A')).rejects.toBeInstanceOf(RosterUnavailableError);
    await expect(store.channelAssign('c1', undefined)).rejects.toBeInstanceOf(
      RosterUnavailableError,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('creates a host-generated id and prepends the section to the order', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);

    const first = await store.sectionCreate('研究');
    const second = await store.sectionCreate('工作流');

    expect(first.id).toMatch(UUID_RE);
    expect(first.id).not.toMatch(/^section-/);
    expect(fake.records.get(first.id)).toEqual({ name: '研究', channelIds: [] });
    expect(fake.state()).toEqual({ pins: [], sectionOrder: [second.id, first.id] });
    expect(store.snapshot()).toEqual({
      pins: [],
      sectionOrder: [second.id, first.id],
      sections: [
        { id: second.id, name: '工作流', channelIds: [] },
        { id: first.id, name: '研究', channelIds: [] },
      ],
    });
  });

  it('renames a section, skips an unchanged name, and rejects unknown ids', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);
    const section = await store.sectionCreate('旧名');

    const renamed = await store.sectionRename(section.id, '新名');
    expect(renamed).toEqual({ id: section.id, name: '新名', channelIds: [] });
    expect(fake.records.get(section.id)?.name).toBe('新名');

    const puts = fake.putCount();
    await store.sectionRename(section.id, '新名');
    expect(fake.putCount()).toBe(puts);

    await expect(store.sectionRename('missing', 'X')).rejects.toBeInstanceOf(
      RosterUnknownSectionError,
    );
  });

  it('removes a section and its order slot while leaving other sections intact', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);
    const first = await store.sectionCreate('A');
    const second = await store.sectionCreate('B');
    await store.channelAssign('c1', first.id);
    await store.channelAssign('c2', second.id);

    await expect(store.sectionRemove(first.id)).resolves.toBe(true);
    expect(await store.sectionRemove(first.id)).toBe(false);
    expect(fake.records.has(first.id)).toBe(false);
    expect(fake.state()).toEqual({ pins: [], sectionOrder: [second.id] });
    expect(store.snapshot().sections).toEqual([{ id: second.id, name: 'B', channelIds: ['c2'] }]);
  });

  it('assigns a channel once, moving it out of its previous section', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);
    const first = await store.sectionCreate('A');
    const second = await store.sectionCreate('B');
    await store.channelAssign('c1', first.id);

    await store.channelAssign('c1', second.id);

    expect(fake.records.get(first.id)?.channelIds).toEqual([]);
    expect(fake.records.get(second.id)?.channelIds).toEqual(['c1']);

    await store.channelAssign('c1', undefined);
    expect(fake.records.get(second.id)?.channelIds).toEqual([]);

    const puts = fake.putCount();
    await store.channelAssign('c1', undefined);
    expect(fake.putCount()).toBe(puts);
  });

  it('positions an assigned channel at the requested index', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);
    const section = await store.sectionCreate('A');
    await store.channelAssign('c1', section.id);
    await store.channelAssign('c2', section.id);
    await store.channelAssign('c3', section.id);

    await store.channelAssign('c3', section.id, 0);

    expect(fake.records.get(section.id)?.channelIds).toEqual(['c3', 'c1', 'c2']);
    await expect(store.channelAssign('c1', 'missing')).rejects.toBeInstanceOf(
      RosterUnknownSectionError,
    );
  });

  it('reorders known section ids and keeps omitted ids after them', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);
    const first = await store.sectionCreate('A');
    const second = await store.sectionCreate('B');
    const third = await store.sectionCreate('C');

    await expect(store.sectionReorder([third.id, 'ghost', first.id])).resolves.toEqual([
      third.id,
      first.id,
      second.id,
    ]);
    expect(fake.state().sectionOrder).toEqual([third.id, first.id, second.id]);

    const sets = fake.setCount();
    await store.sectionReorder([third.id, first.id, second.id]);
    expect(fake.setCount()).toBe(sets);
  });

  it('sets pins with duplicates dropped and writes only on change', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);

    await expect(store.pinsSet(['ada', 'ada', '', 'scout'])).resolves.toEqual(['ada', 'scout']);
    expect(fake.state().pins).toEqual(['ada', 'scout']);

    const sets = fake.setCount();
    await store.pinsSet(['ada', 'scout']);
    expect(fake.setCount()).toBe(sets);
  });

  it('closes the domain on detach and rejects writes afterwards', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);

    await store.detach();

    expect(fake.closeCount()).toBe(1);
    expect(store.available).toBe(false);
    await expect(store.pinsSet(['ada'])).rejects.toBeInstanceOf(RosterUnavailableError);
  });

  it('closes a domain that resolves after detach', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    const attaching = store.attach(fake.facility);
    await store.detach();
    await attaching;

    expect(fake.closeCount()).toBe(1);
    expect(store.available).toBe(false);
  });
});

describe('roster flat topOrder', () => {
  it('prepends a newly created section to an existing flat order', async () => {
    const fake = createFakeRosterDomain({
      records: { s1: { name: 'A', channelIds: [] } },
      state: {
        pins: [],
        sectionOrder: ['s1'],
        topOrder: [
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: 's1' },
        ],
      },
    });
    const store = createRosterStore();
    await store.attach(fake.facility);

    const created = await store.sectionCreate('最新');

    expect(fake.state().topOrder).toEqual([
      { kind: 'section', id: created.id },
      { kind: 'channel', id: 'loose' },
      { kind: 'section', id: 's1' },
    ]);
  });

  it('projects absent topOrder as undefined and keeps legacy writes flat-free', async () => {
    const fake = createFakeRosterDomain();
    const store = createRosterStore();
    await store.attach(fake.facility);

    const section = await store.sectionCreate('A');
    await store.channelAssign('c1', section.id, 0);
    await store.channelAssign('c2', undefined);

    expect(store.snapshot().topOrder).toBeUndefined();
    expect(fake.state()).toEqual({
      pins: [],
      sectionOrder: [section.id],
    });
    expect(fake.records.get(section.id)).toEqual({ name: 'A', channelIds: ['c1'] });
  });

  it('maintains the flat list across section and membership writes', async () => {
    const fake = createFakeRosterDomain({
      records: {
        s1: { name: 'A', channelIds: ['c1'] },
        s2: { name: 'B', channelIds: [] },
      },
      state: {
        pins: [],
        sectionOrder: ['s1', 's2'],
        topOrder: [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: 's2' },
        ],
      },
    });
    const store = createRosterStore();
    await store.attach(fake.facility);

    // Assigning into a section drops the channel's loose entry.
    await store.channelAssign('loose', 's2', 0);
    expect(fake.state().topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'section', id: 's2' },
    ]);

    // Unassigning appends the loose entry at the end.
    await store.channelAssign('c1', undefined);
    expect(fake.state().topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'section', id: 's2' },
      { kind: 'channel', id: 'c1' },
    ]);

    // Removing a section splices its members in at the removed position.
    await store.sectionRemove('s2');
    expect(fake.state().topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
      { kind: 'channel', id: 'c1' },
    ]);
    expect(store.snapshot().topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
      { kind: 'channel', id: 'c1' },
    ]);
  });

  it('reorders sections within the flat list while loose channels stay fixed', async () => {
    const fake = createFakeRosterDomain({
      records: {
        s1: { name: 'A', channelIds: [] },
        s2: { name: 'B', channelIds: [] },
      },
      state: {
        pins: [],
        sectionOrder: ['s1', 's2'],
        topOrder: [
          { kind: 'channel', id: 'top' },
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'mid' },
          { kind: 'section', id: 's2' },
        ],
      },
    });
    const store = createRosterStore();
    await store.attach(fake.facility);

    await expect(store.sectionReorder(['s2', 's1'])).resolves.toEqual(['s2', 's1']);
    expect(fake.state().topOrder).toEqual([
      { kind: 'channel', id: 'top' },
      { kind: 'section', id: 's2' },
      { kind: 'channel', id: 'mid' },
      { kind: 'section', id: 's1' },
    ]);
    expect(store.snapshot().sectionOrder).toEqual(['s2', 's1']);
  });

  it('writes absolute flat orders and sanitizes them', async () => {
    const fake = createFakeRosterDomain({
      records: { s1: { name: 'A', channelIds: ['c1'] } },
      state: { pins: [], sectionOrder: ['s1'], topOrder: [{ kind: 'section', id: 's1' }] },
    });
    const store = createRosterStore();
    await store.attach(fake.facility);

    await expect(
      store.topReorder([
        { kind: 'channel', id: 'c9' },
        { kind: 'section', id: 's1' },
        { kind: 'section', id: 'ghost' },
        { kind: 'channel', id: 'c1' },
        { kind: 'channel', id: 'c9' },
      ]),
    ).resolves.toEqual([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    expect(fake.state().topOrder).toEqual([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);

    const sets = fake.setCount();
    await store.topReorder([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    expect(fake.setCount()).toBe(sets);
  });
});
