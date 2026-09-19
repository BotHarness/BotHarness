import type { Domain, DomainGlobal, DomainSpec, KvTable } from '@deepseek-ai/dsh-storage-domain';

import type { RosterDomainFacility } from '../src/roster/store.js';
import {
  rosterDomainSpec,
  type RosterDomainState,
  type RosterSectionRecord,
} from '../src/roster/spec.js';

/** Counted in-memory stand-in for one open roster domain. */
export interface FakeRosterDomain {
  readonly facility: RosterDomainFacility;
  readonly records: Map<string, RosterSectionRecord>;
  state(): RosterDomainState;
  putCount(): number;
  setCount(): number;
  closeCount(): number;
}

class FakeTable implements KvTable<string, RosterSectionRecord> {
  puts = 0;

  constructor(private readonly records: Map<string, RosterSectionRecord>) {}

  get(key: string): RosterSectionRecord | undefined {
    return this.records.get(key);
  }

  entries(): IterableIterator<[string, RosterSectionRecord]> {
    return [...this.records.entries()][Symbol.iterator]();
  }

  keys(): IterableIterator<string> {
    return [...this.records.keys()][Symbol.iterator]();
  }

  get size(): number {
    return this.records.size;
  }

  async put(key: string, value: RosterSectionRecord): Promise<void> {
    this.puts += 1;
    this.records.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async update(key: string, fn: (current: RosterSectionRecord) => RosterSectionRecord) {
    const current = this.records.get(key);
    if (current === undefined) throw new Error(`missing-key: ${key}`);
    const next = fn(current);
    this.puts += 1;
    this.records.set(key, next);
    return next;
  }
}

/**
 * Build one in-memory roster domain the store can attach to. The fake mirrors
 * the storage-domain handle surface the store uses; counters prove when a
 * write was actually issued (idempotence) and when close ran.
 * @param initial - Optional preloaded records/global for reopen-style tests.
 */
export function createFakeRosterDomain(
  initial: {
    records?: Record<string, RosterSectionRecord>;
    state?: RosterDomainState;
  } = {},
): FakeRosterDomain {
  const records = new Map(Object.entries(initial.records ?? {}));
  const table = new FakeTable(records);
  let state: RosterDomainState = initial.state ?? { pins: [], sectionOrder: [] };
  let sets = 0;
  let closes = 0;
  const global: DomainGlobal<RosterDomainState> = {
    get: () => state,
    set: async (value) => {
      sets += 1;
      state = value;
    },
  };
  const domain = {
    name: rosterDomainSpec.name,
    global,
    table: (name: string) => {
      if (name !== 'sections') throw new Error(`undeclared table '${name}'`);
      return table;
    },
    close: async () => {
      closes += 1;
    },
  } as unknown as Domain<typeof rosterDomainSpec>;
  return {
    facility: {
      open: async <S extends DomainSpec>(_spec: S) => domain as unknown as Domain<S>,
    },
    records,
    state: () => state,
    putCount: () => table.puts,
    setCount: () => sets,
    closeCount: () => closes,
  };
}
