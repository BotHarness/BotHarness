import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";

export const collections = {
  docs: defineCollection(
    docsCollection({
      schemaFields: {
        audience: z.literal("human").optional(),
        untranslated: z.boolean().optional(),
        skillVersion: z.string().optional(),
        verifiedAgainst: z.string().optional(),
        upstreamSha: z.string().optional(),
        verifiedAt: z.string().optional(),
      },
    }),
  ),
  "docs-zh": defineCollection(
    docsCollection({
      base: "docs-zh",
      schemaFields: {
        audience: z.literal("human").optional(),
        untranslated: z.boolean().optional(),
        skillVersion: z.string().optional(),
        verifiedAgainst: z.string().optional(),
        upstreamSha: z.string().optional(),
        verifiedAt: z.string().optional(),
      },
    }),
  ),
  changelog: defineCollection(
    docsCollection({
      base: "changelog",
      schemaFields: {
        date: z.coerce.date({
          error: (iss) =>
            iss.input === undefined
              ? 'Missing required "date" in changelog frontmatter (e.g. 2026-06-16).'
              : '"date" must be a valid date (e.g. 2026-06-16).',
        }),
        tags: z.array(z.string()).default([]),
        releaseVersion: z.string().optional(),
        developmentSummary: z.boolean().optional(),
      },
    }),
  ),
  "changelog-zh": defineCollection(
    docsCollection({
      base: "changelog-zh",
      schemaFields: {
        date: z.coerce.date({
          error: (iss) =>
            iss.input === undefined
              ? 'Missing required "date" in changelog frontmatter (e.g. 2026-06-16).'
              : '"date" must be a valid date (e.g. 2026-06-16).',
        }),
        tags: z.array(z.string()).default([]),
        releaseVersion: z.string().optional(),
        developmentSummary: z.boolean().optional(),
      },
    }),
  ),
  partials: defineCollection(partialsCollection()),
};
