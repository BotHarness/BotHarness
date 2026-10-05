import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { z } from 'zod';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../src/database/owner.js';
import {
  createRosterStore,
  type RosterStore,
  type RosterStoreOptions,
} from '../src/roster/store.js';

import { registryDatabase } from './registry-fixture.js';

import type { Domain, DomainGlobal, DomainSpec, KvTable } from '@deepseek-ai/dsh-storage-domain';

import type { RosterDomainFacility } from '../src/roster/store.js';
import {
  rosterDomainSpec,
  rosterDomainState,
  rosterSectionRecord,
  type RosterDomainState,
  type RosterSectionRecord,
} from '../src/roster/spec.js';

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

const rosterRoots: string[] = [];
const rosterOwners = new WeakMap<RosterStore, OperationalDatabaseOwner>();
const changeBaselines = new WeakMap<RosterStore, number>();
const storedArrangement = z.object({
  state: rosterDomainState,
  sections: z.array(z.tuple([z.string(), rosterSectionRecord])),
});

export function createTestRosterStore(options: Partial<RosterStoreOptions> = {}): RosterStore {
  const root =
    options.database === undefined
      ? mkdtempSync(join(tmpdir(), 'botharness-roster-db-'))
      : undefined;
  if (root !== undefined) rosterRoots.push(root);
  const database = options.database ?? (root === undefined ? undefined : registryDatabase(root));
  if (database === undefined) throw new Error('Missing test database');
  const store = createRosterStore({ ...options, database });
  rosterOwners.set(store, database);
  const attach = store.attach.bind(store);
  store.attach = async (facility) => {
    await attach(facility);
    changeBaselines.set(store, totalChanges(store));
  };
  return store;
}

function rosterPort(store: RosterStore) {
  const owner = rosterOwners.get(store);
  if (owner === undefined) throw new Error('Missing test roster owner');
  return attachOperationalModule(owner, 'roster-test-query');
}
function storedData(store: RosterStore) {
  return rosterPort(store).read((database) => {
    const row = database.prepare('SELECT body FROM roster_arrangement WHERE singleton = 1').get();
    if (typeof row?.body !== 'string') throw new Error('Missing roster record');
    return storedArrangement.parse(JSON.parse(row.body));
  });
}
export function storedState(store: RosterStore): RosterDomainState {
  return storedData(store).state;
}
export function storedSection(store: RosterStore, id: string): RosterSectionRecord | undefined {
  return storedData(store).sections.find(([key]) => key === id)?.[1];
}
function totalChanges(store: RosterStore): number {
  return rosterPort(store).read((database) =>
    Number(database.prepare('SELECT total_changes() AS changes').get()?.changes),
  );
}
export function storedWriteCount(store: RosterStore): number {
  return totalChanges(store) - (changeBaselines.get(store) ?? 0);
}
afterEach(() => {
  for (const root of rosterRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});
