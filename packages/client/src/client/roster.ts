/**
 * The client's roster model: the wire projection of the Host
 * `botharness_roster` arrangement, the defensive parser applied to every
 * `rosterGet` response, and the membership reconciliation the channel-order
 * write plans with.
 */

/** One Channel section as projected by `rosterGet` / `sectionCreate`. */
export interface RosterSection {
  id: string;
  name: string;
  channelIds: string[];
}

/** One flat top-level entry: a section block or a loose (section-less) channel. */
export interface TopOrderEntry {
  kind: 'section' | 'channel';
  id: string;
}

/** The arrangement projected by `rosterGet`; `pins` contains Channel ids. */
export interface RosterSnapshot {
  pins: string[];
  hidden: string[];
  sections: RosterSection[];
  /**
   * Flat top-level order, or `undefined` when the host domain predates the
   * flat remodel (legacy fallback); the client converts it once on load.
   */
  topOrder: TopOrderEntry[] | undefined;
}

/** The arrangement a host without a storage backend projects. */
export function emptyRosterSnapshot(): RosterSnapshot {
  return { pins: [], hidden: [], sections: [], topOrder: undefined };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Keep the non-empty unique strings of an unknown value; order preserved. */
export function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

/** Whether two id sequences are equal, position by position. */
export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * Restore one scope's membership to a preferred order: the preferred ids that
 * are members come first (first occurrence wins), then every member the
 * preferred order omitted, in its existing order.
 * @param preferred - Stored order to apply.
 * @param members - Current membership ids in their existing order.
 * @returns Member ids in the reconciled order; inputs are not mutated.
 */
export function reconcileOrder(preferred: readonly string[], members: readonly string[]): string[] {
  const known = new Set(members);
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of members) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

/**
 * Plan the frozen channel order of one section from a requested display order.
 * @param section - Section whose membership must be preserved.
 * @param order - Requested display order.
 * @returns The reconciled member order, or `undefined` when it already matches.
 */
export function planSectionChannelOrder(
  section: RosterSection,
  order: readonly string[],
): string[] | undefined {
  const target = reconcileOrder(order, section.channelIds);
  return sameIds(target, section.channelIds) ? undefined : target;
}

/** Parse one section record; malformed entries are dropped. */
export function parseRosterSection(value: unknown): RosterSection | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const name = record['name'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof name !== 'string') return undefined;
  return { id, name, channelIds: uniqueStrings(record['channelIds']) };
}

/**
 * Parse a full `rosterGet` value. The host already projects sections in
 * display order (flat `topOrder` position when it carries one, else
 * `sectionOrder`), so the parser keeps that array order (deduplicated) instead
 * of re-running order reconciliation on the client. A missing `topOrder`
 * means a pre-flat host domain (legacy fallback, converted once on load).
 */
export function parseRosterSnapshot(value: unknown): RosterSnapshot {
  const record = asRecord(value);
  if (record === undefined) return emptyRosterSnapshot();
  const sections: RosterSection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      const section = parseRosterSection(entry);
      if (section === undefined || seen.has(section.id)) continue;
      seen.add(section.id);
      sections.push(section);
    }
  }
  return {
    pins: uniqueStrings(record['pins']),
    hidden: uniqueStrings(record['hidden']),
    sections,
    topOrder: parseTopOrder(record),
  };
}

/** Parse one flat entry; malformed entries (bad kind, blank id) are dropped. */
export function parseTopOrderEntry(value: unknown): TopOrderEntry | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const kind = record['kind'];
  const id = record['id'];
  if (kind !== 'section' && kind !== 'channel') return undefined;
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return { kind, id };
}

function parseTopOrder(record: Record<string, unknown>): TopOrderEntry[] | undefined {
  const value = record['topOrder'];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const entries: TopOrderEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const entry = parseTopOrderEntry(item);
    if (entry === undefined) continue;
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}
