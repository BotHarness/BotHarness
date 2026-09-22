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
import type { TopOrderEntry } from './spec.js';

/** Public projection of one section, in display order. */
export interface RosterSection {
  id: string;
  name: string;
  channelIds: string[];
}

/** Public projection of the whole arrangement. */
export interface RosterSnapshot {
  pins: string[];
  /** Channel ids hidden from every roster navigation surface. */
  hidden: string[];
  sectionOrder: string[];
  sections: RosterSection[];
  /**
   * Flat top-level order mixing section blocks and loose channels. `undefined`
   * means the domain predates the flat remodel (legacy fallback: sections in
   * `sectionOrder`, unsectioned channels loose at the end); the client
   * converts it once on first load.
   */
  topOrder: TopOrderEntry[] | undefined;
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

function entryKey(entry: TopOrderEntry): string {
  return `${entry.kind}:${entry.id}`;
}

function sameEntries(left: readonly TopOrderEntry[], right: readonly TopOrderEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index] as TopOrderEntry;
      return entry.kind === other.kind && entry.id === other.id;
    })
  );
}

/**
 * Clean one flat order against the sections table: drop section entries with
 * no record, drop loose entries for channels that currently live in a
 * section (single ownership — contained channels never hold a loose entry),
 * and drop repeats (first occurrence wins). The host cannot validate channel
 * ids (channels live outside this domain), so unknown channel entries pass
 * through and the client reconciles them with its known channels.
 */
function sanitizeTopOrder(
  entries: readonly TopOrderEntry[],
  table: KvTable<string, RosterSectionRecord>,
): TopOrderEntry[] {
  const sectioned = new Set<string>();
  for (const [, record] of table.entries()) {
    for (const channelId of record.channelIds) sectioned.add(channelId);
  }
  const seen = new Set<string>();
  const next: TopOrderEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'section') {
      if (table.get(entry.id) === undefined) continue;
    } else if (sectioned.has(entry.id)) {
      continue;
    }
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ kind: entry.kind, id: entry.id });
  }
  return next;
}

/**
 * Merge one global write without dropping the optional flat order: every
 * writer threads `topOrder` through, so a legacy-shape write can never wipe a
 * flat domain (and absent stays absent for pre-flat domains).
 */
function nextGlobalState(
  state: RosterDomainState,
  patch: {
    pins?: readonly string[];
    hidden?: readonly string[];
    sectionOrder?: readonly string[];
    topOrder?: readonly TopOrderEntry[] | undefined;
  },
): RosterDomainState {
  const next: RosterDomainState = {
    pins: patch.pins === undefined ? [...state.pins] : [...patch.pins],
    sectionOrder:
      patch.sectionOrder === undefined ? [...state.sectionOrder] : [...patch.sectionOrder],
  };
  const hidden = patch.hidden ?? state.hidden;
  if (hidden !== undefined) next.hidden = [...hidden];
  const topOrder = patch.topOrder ?? state.topOrder;
  if (topOrder !== undefined) next.topOrder = [...topOrder];
  return next;
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
  constructor(
    private readonly options: {
      warn?: ((message: string) => void) | undefined;
      onCommitted?: (() => void) | undefined;
    } = {},
  ) {}

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
   * instead of pretending the arrangement is empty. Sections project in flat
   * `topOrder` position once the domain carries one, else in `sectionOrder`.
   */
  snapshot(): RosterSnapshot {
    const table = this.requireTable();
    const state = this.requireGlobal().get();
    const topOrder =
      state.topOrder === undefined ? undefined : sanitizeTopOrder(state.topOrder, table);
    const order =
      topOrder === undefined
        ? state.sectionOrder
        : [
            ...topOrder.flatMap((entry) => (entry.kind === 'section' ? [entry.id] : [])),
            ...state.sectionOrder,
          ];
    const sections = this.orderedSections(order);
    return {
      pins: [...state.pins],
      hidden: [...(state.hidden ?? [])],
      sectionOrder: sections.map((section) => section.id),
      sections,
      topOrder,
    };
  }

  /**
   * Create one section with a host-generated id and prepend it to the order —
   * both the legacy section order and, when the domain already carries one,
   * the flat order (new sections land at the top).
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
        await global.set(
          nextGlobalState(state, {
            sectionOrder: [id, ...state.sectionOrder],
            topOrder:
              state.topOrder === undefined
                ? undefined
                : [{ kind: 'section', id }, ...state.topOrder],
          }),
        );
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
   * former members become loose channels spliced in at the removed block's
   * flat position (they appear where their section was, in member order).
   * @param sectionId - Section to remove.
   * @returns `true` when a record was deleted, `false` when it was unknown.
   */
  sectionRemove(sectionId: string): Promise<boolean> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const removed = table.get(sectionId);
      const deleted = await table.delete(sectionId);
      if (!deleted) return false;
      const state = global.get();
      const members = removed === undefined ? [] : [...removed.channelIds];
      await global.set(
        nextGlobalState(state, {
          sectionOrder: state.sectionOrder.filter((id) => id !== sectionId),
          topOrder:
            state.topOrder === undefined
              ? undefined
              : sanitizeTopOrder(
                  state.topOrder.flatMap((entry) =>
                    entry.kind === 'section' && entry.id === sectionId
                      ? members.map((id) => ({ kind: 'channel' as const, id }))
                      : [entry],
                  ),
                  table,
                ),
        }),
      );
      return true;
    });
  }

  /**
   * Assign one Channel to a section at a position, removing any previous
   * ownership first so membership stays single. `undefined` moves the Channel
   * back to loose (it gains a flat entry at the end); repeating the same
   * assignment writes nothing. Assigning into a section drops the channel's
   * loose flat entry. The flat order itself is only touched when present —
   * pre-flat domains keep no `topOrder` until the client converts them.
   * @param channelId - Channel to place.
   * @param sectionId - Target section, or `undefined` for loose.
   * @param index - Target position after removal; omitted appends.
   */
  channelAssign(channelId: string, sectionId: string | undefined, index?: number): Promise<void> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      const global = this.requireGlobal();
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
      const state = global.get();
      if (state.topOrder === undefined) return;
      const topOrder =
        sectionId === undefined
          ? [...state.topOrder, { kind: 'channel' as const, id: channelId }]
          : state.topOrder.filter((entry) => entry.kind !== 'channel' || entry.id !== channelId);
      // Compare against the raw stored order (not the sanitized projection)
      // so a write also converges stale entries instead of masking them.
      const next = sanitizeTopOrder(topOrder, table);
      if (!sameEntries(next, state.topOrder)) {
        await global.set(nextGlobalState(state, { topOrder: next }));
      }
    });
  }

  /**
   * Replace the section display order. Ids the caller omits keep their prior
   * position after the listed ones; unknown ids are dropped. Section entries
   * in a flat order follow the same relative order while loose channels stay
   * exactly where they are.
   * @param order - Section ids in their intended order.
   * @returns the committed order.
   */
  sectionReorder(order: readonly string[]): Promise<string[]> {
    return this.enqueue(async () => {
      const table = this.requireTable();
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
      let topOrder: TopOrderEntry[] | undefined;
      if (state.topOrder !== undefined) {
        // Sections take the new relative order; loose channels keep their
        // exact slots; sections missing from the flat list append at the end.
        const placed = new Set(
          state.topOrder.flatMap((entry) => (entry.kind === 'section' ? [entry.id] : [])),
        );
        const queue = next.filter((id) => placed.has(id));
        const rest = next.filter((id) => !placed.has(id));
        const merged: TopOrderEntry[] = [];
        for (const entry of state.topOrder) {
          if (entry.kind === 'section') {
            merged.push({ kind: 'section', id: queue.shift() as string });
          } else {
            merged.push({ kind: entry.kind, id: entry.id });
          }
        }
        for (const id of rest) merged.push({ kind: 'section', id });
        topOrder = sanitizeTopOrder(merged, table);
      }
      const storedTop = state.topOrder;
      if (
        sameIds(next, state.sectionOrder) &&
        (topOrder === undefined || (storedTop !== undefined && sameEntries(topOrder, storedTop)))
      ) {
        return next;
      }
      await global.set(nextGlobalState(state, { sectionOrder: next, topOrder }));
      return next;
    });
  }

  /**
   * Replace the flat top-level order outright: the absolute placement write
   * for loose channels (gap drops, migration). Unknown section entries,
   * contained-channel loose entries, and repeats are dropped; the legacy
   * section order is left alone (section drags own it through
   * {@link sectionReorder}).
   * @param order - Flat entries in their intended order.
   * @returns the committed order.
   */
  topReorder(order: readonly TopOrderEntry[]): Promise<TopOrderEntry[]> {
    return this.enqueue(async () => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const state = global.get();
      const next = sanitizeTopOrder(order, table);
      const current =
        state.topOrder === undefined ? undefined : sanitizeTopOrder(state.topOrder, table);
      if (current !== undefined && sameEntries(next, current)) return next;
      await global.set(nextGlobalState(state, { topOrder: next }));
      return next;
    });
  }

  /**
   * Replace the pinned Channel id list.
   * @param pins - Pinned Channel ids; duplicates and blanks are dropped.
   * @returns the committed pins.
   */
  pinsSet(pins: readonly string[]): Promise<string[]> {
    return this.enqueue(async () => {
      const global = this.requireGlobal();
      const next = uniqueStrings(pins);
      const state = global.get();
      if (!sameIds(next, state.pins)) {
        await global.set(nextGlobalState(state, { pins: next }));
      }
      return next;
    });
  }

  /**
   * Replace the Channel ids hidden from the roster. Hiding is presentation
   * state only: pins, section membership, and flat order stay untouched so a
   * restored Channel returns to its exact previous placement.
   * @param hidden - Hidden Channel ids; duplicates and blanks are dropped.
   * @returns the committed hidden list.
   */
  hiddenSet(hidden: readonly string[]): Promise<string[]> {
    return this.enqueue(async () => {
      const global = this.requireGlobal();
      const next = uniqueStrings(hidden);
      const state = global.get();
      if (!sameIds(next, state.hidden ?? [])) {
        await global.set(nextGlobalState(state, { hidden: next }));
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
    const result = this.tail.then(async () => {
      const value = await operation();
      try {
        this.options.onCommitted?.();
      } catch (error) {
        this.options.warn?.(`botharness: roster committed notification failed: ${String(error)}`);
      }
      return value;
    });
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
  options: {
    warn?: ((message: string) => void) | undefined;
    onCommitted?: (() => void) | undefined;
  } = {},
): RosterStore {
  return new RosterStore(options);
}
