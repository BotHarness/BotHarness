/**
 * Durable roster arrangement over the `botharness_roster` storage domain:
 * host-generated section ids, ordered membership, section order, and pins.
 * Storage is an optional capability — the store attaches when the domain
 * facility appears and throws {@link RosterUnavailableError} for every read
 * and write otherwise, which the bridge reports as `storage-unavailable`.
 * @module @botharness/core/roster/store
 */

import { randomUUID } from 'node:crypto';

import type { Domain, DomainGlobal, DomainSpec, KvTable } from '@deepseek-ai/dsh-storage-domain';

import { rosterDomainSpec, type RosterDomainState, type RosterSectionRecord } from './spec.js';

/** Public projection of one section, in display order. */
export interface RosterSection {
  id: string;
  name: string;
  channelIds: string[];
}

/** Public projection of the whole arrangement. */
export interface RosterSnapshot {
  pins: string[];
  sectionOrder: string[];
  sections: RosterSection[];
}

/** The optional `storageDomain` capability the roster store opens through. */
export interface RosterDomainFacility {
  open<S extends DomainSpec>(spec: S): Promise<Domain<S>>;
}

/** Raised when no roster domain backend is mounted. */
export class RosterUnavailableError extends Error {
  constructor() {
    super('roster storage is unavailable');
    this.name = 'RosterUnavailableError';
  }
}

/** Raised when a write names a section id the domain does not hold. */
export class RosterUnknownSectionError extends Error {
  constructor(readonly sectionId: string) {
    super(`unknown Channel section: ${sectionId}`);
    this.name = 'RosterUnknownSectionError';
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * The roster domain handle plus the single write chain that serializes
 * multi-step mutations (create appends to the global order; assign moves one
 * channel across records). Reads are synchronous from the domain's memory.
 */
export class RosterStore {
  private domain: Domain<typeof rosterDomainSpec> | undefined;
  private table: KvTable<string, RosterSectionRecord> | undefined;
  private global: DomainGlobal<RosterDomainState> | undefined;
  private opening: Promise<void> | undefined;
  private closing = false;
  private warned = false;
  private tail: Promise<void> = Promise.resolve();

  /**
   * @param options.warn - One-shot report for the unavailable degradation path.
   */
  constructor(private readonly options: { warn?: ((message: string) => void) | undefined } = {}) {}

  /** Whether a domain is currently open and serving writes. */
  get available(): boolean {
    return this.domain !== undefined;
  }

  /** Open the domain through the optional facility; a disposed store closes it immediately. */
  async attach(facility: RosterDomainFacility): Promise<void> {
    this.closing = false;
    const opening = facility.open(rosterDomainSpec).then(async (domain) => {
      if (this.closing) {
        await domain.close();
        return;
      }
      this.domain = domain;
      this.table = domain.table('sections');
      this.global = domain.global;
      this.warned = false;
    });
    this.opening = opening;
    try {
      await opening;
    } finally {
      if (this.opening === opening) this.opening = undefined;
    }
  }

  /** Close the open domain and reject in-flight opens; safe to call before attach resolves. */
  async detach(): Promise<void> {
    this.closing = true;
    const opening = this.opening;
    if (opening !== undefined) await opening.catch(() => {});
    const domain = this.domain;
    this.domain = undefined;
    this.table = undefined;
    this.global = undefined;
    if (domain !== undefined) await domain.close();
  }

  /**
   * The full arrangement. Throws {@link RosterUnavailableError} when no domain
   * is attached, so every bridge method can report `storage-unavailable`
   * instead of pretending the arrangement is empty.
   */
  snapshot(): RosterSnapshot {
    const state = this.requireGlobal().get();
    const sections = this.orderedSections(state.sectionOrder);
    return { pins: [...state.pins], sectionOrder: sections.map((section) => section.id), sections };
  }

  /**
   * Create one section with a host-generated id and append it to the order.
   * @param name - Trimmed display name.
   * @returns the created section record.
   */
  sectionCreate(name: string): Promise<RosterSection> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const id = randomUUID();
      await table.put(id, { name, channelIds: [] });
      const state = global.get();
      try {
        await global.set({ pins: state.pins, sectionOrder: [...state.sectionOrder, id] });
      } catch (error) {
        await table.delete(id).catch(() => {});
        throw error;
      }
      return { id, name, channelIds: [] };
    });
  }

  /**
   * Rename one existing section.
   * @param sectionId - Section to rename.
   * @param name - New display name.
   * @returns the updated section record.
   */
  sectionRename(sectionId: string, name: string): Promise<RosterSection> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      const current = table.get(sectionId);
      if (current === undefined) throw new RosterUnknownSectionError(sectionId);
      if (current.name !== name) {
        await table.put(sectionId, { name, channelIds: [...current.channelIds] });
      }
      return { id: sectionId, name, channelIds: [...current.channelIds] };
    });
  }

  /**
   * Remove one section. Membership lives only in its `channelIds`, so the
   * Channels fall back to ungrouped.
   * @param sectionId - Section to remove.
   * @returns `true` when a record was deleted, `false` when it was unknown.
   */
  sectionRemove(sectionId: string): Promise<boolean> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const deleted = await table.delete(sectionId);
      if (!deleted) return false;
      const state = global.get();
      await global.set({
        pins: state.pins,
        sectionOrder: state.sectionOrder.filter((id) => id !== sectionId),
      });
      return true;
    });
  }

  /**
   * Assign one Channel to a section at a position, removing any previous
   * ownership first so membership stays single. `undefined` moves the Channel
   * back to ungrouped; repeating the same assignment writes nothing.
   * @param channelId - Channel to place.
   * @param sectionId - Target section, or `undefined` for ungrouped.
   * @param index - Target position after removal; omitted appends.
   */
  channelAssign(channelId: string, sectionId: string | undefined, index?: number): Promise<void> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      if (sectionId !== undefined && table.get(sectionId) === undefined) {
        throw new RosterUnknownSectionError(sectionId);
      }
      const removals: Array<[string, RosterSectionRecord]> = [];
      let target: [string, RosterSectionRecord] | undefined;
      for (const [id, record] of table.entries()) {
        const without = record.channelIds.filter((candidate) => candidate !== channelId);
        if (id === sectionId) {
          const at =
            index === undefined ? without.length : Math.max(0, Math.min(index, without.length));
          const channelIds = [...without.slice(0, at), channelId, ...without.slice(at)];
          if (!sameIds(channelIds, record.channelIds)) {
            target = [id, { name: record.name, channelIds }];
          }
          continue;
        }
        if (without.length !== record.channelIds.length) {
          removals.push([id, { name: record.name, channelIds: without }]);
        }
      }
      for (const [id, record] of removals) await table.put(id, record);
      if (target !== undefined) await table.put(target[0], target[1]);
    });
  }

  /**
   * Replace the section display order. Ids the caller omits keep their prior
   * position after the listed ones; unknown ids are dropped.
   * @param order - Section ids in their intended order.
   * @returns the committed order.
   */
  sectionReorder(order: readonly string[]): Promise<string[]> {
    return this.enqueue(async () => {
      const global = this.requireGlobal();
      const current = this.orderedSections(global.get().sectionOrder).map((section) => section.id);
      const known = new Set(current);
      const next: string[] = [];
      for (const id of order) {
        if (known.has(id) && !next.includes(id)) next.push(id);
      }
      for (const id of current) {
        if (!next.includes(id)) next.push(id);
      }
      const state = global.get();
      if (!sameIds(next, state.sectionOrder)) {
        await global.set({ pins: state.pins, sectionOrder: next });
      }
      return next;
    });
  }

  /**
   * Replace the pinned BOT slug list.
   * @param pins - Pinned slugs; duplicates and blanks are dropped.
   * @returns the committed pins.
   */
  pinsSet(pins: readonly string[]): Promise<string[]> {
    return this.enqueue(async () => {
      const global = this.requireGlobal();
      const next = uniqueStrings(pins);
      const state = global.get();
      if (!sameIds(next, state.pins)) {
        await global.set({ pins: next, sectionOrder: state.sectionOrder });
      }
      return next;
    });
  }

  private orderedSections(order: readonly string[]): RosterSection[] {
    const table = this.requireTable();
    const seen = new Set<string>();
    const sections: RosterSection[] = [];
    const project = (id: string, record: RosterSectionRecord): RosterSection => ({
      id,
      name: record.name,
      channelIds: [...record.channelIds],
    });
    for (const id of order) {
      if (seen.has(id)) continue;
      const record = table.get(id);
      if (record === undefined) continue;
      seen.add(id);
      sections.push(project(id, record));
    }
    for (const [id, record] of table.entries()) {
      if (seen.has(id)) continue;
      seen.add(id);
      sections.push(project(id, record));
    }
    return sections;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private reportUnavailable(): void {
    if (this.warned) return;
    this.warned = true;
    this.options.warn?.(
      'botharness: storageDomain is unavailable; the roster arrangement is read-only',
    );
  }

  private requireTable(): KvTable<string, RosterSectionRecord> {
    if (this.table === undefined) {
      this.reportUnavailable();
      throw new RosterUnavailableError();
    }
    return this.table;
  }

  private requireGlobal(): DomainGlobal<RosterDomainState> {
    if (this.global === undefined) {
      this.reportUnavailable();
      throw new RosterUnavailableError();
    }
    return this.global;
  }
}

/**
 * Create the roster store used by the bridge methods.
 * @param options.warn - One-shot report for the unavailable degradation path.
 * @returns the store, unattached until the domain facility appears.
 */
export function createRosterStore(
  options: { warn?: ((message: string) => void) | undefined } = {},
): RosterStore {
  return new RosterStore(options);
}
