/**
 * The roster domain declaration: section records plus the global order/pin
 * singleton the `botharness_roster` storage domain opens. The zod schemas
 * validate the shipped format at the durable boundary and stay the single
 * source of the domain's identity, version, and layout.
 * @module @botharness/core/roster/spec
 */

import { z } from 'zod';

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';

/** Durable shape of one section: display name plus ordered member channel ids. */
export const rosterSectionRecord = z.object({
  name: z.string(),
  channelIds: z.array(z.string()),
});

/** One stored section record, inferred from {@link rosterSectionRecord}. */
export type RosterSectionRecord = z.infer<typeof rosterSectionRecord>;

/** One flat top-level entry: a section block or a loose (section-less) channel. */
export const topOrderEntry = z.object({
  kind: z.enum(['section', 'channel']),
  id: z.string().min(1),
});

/** One flat top-level entry, inferred from {@link topOrderEntry}. */
export type TopOrderEntry = z.infer<typeof topOrderEntry>;

/**
 * Durable global singleton. `pins` is the pinned BOT slug list in display
 * order; `sectionOrder` is the section display order (the `sections` table has
 * no implicit order); `topOrder` is the flat top-level order mixing section
 * blocks and loose channels. `topOrder` is optional so domains written before
 * the flat remodel still parse — absent means legacy (sections in
 * `sectionOrder`, every unsectioned channel loose at the end) and the client
 * converts it once on first load.
 */
export const rosterDomainState = z.object({
  pins: z.array(z.string()),
  sectionOrder: z.array(z.string()),
  topOrder: z.array(topOrderEntry).optional(),
});

/** Durable global state, inferred from {@link rosterDomainState}. */
export type RosterDomainState = z.infer<typeof rosterDomainState>;

/**
 * The roster domain spec: one `sections` table keyed by a host-generated id
 * plus the pins/order singleton, on the default `single` layout.
 */
export const rosterDomainSpec = defineDomain({
  name: 'botharness_roster',
  version: 1,
  layout: 'single',
  global: {
    schema: rosterDomainState,
    initial: { pins: [], sectionOrder: [], topOrder: [] },
  },
  tables: { sections: domainTable<string, RosterSectionRecord>(rosterSectionRecord) },
});
