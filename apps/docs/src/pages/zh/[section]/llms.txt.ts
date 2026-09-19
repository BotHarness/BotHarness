/**
 * `/zh/docs/llms.txt`, `/zh/dev/llms.txt`, `/zh/changelog/llms.txt` — the
 * Chinese per-section agent indexes. Nimbus only emits per-section `llms.txt`
 * for the root tree, so this route mirrors the shape from the indexed `docs-zh`
 * entries (and from the `changelog-zh` tree, the Chinese side of the changelog
 * pairs, with `/zh`-prefixed markdown URLs). Keeps the `/zh` endpoints
 * symmetric with the root instead of serving English fallbacks.
 */
import { getCollection } from "astro:content";
import {
  entryRouteKey,
  getIndexedEntries,
  isDiscoverable,
} from "@cloudflare/nimbus-docs/runtime";
import { config } from "virtual:nimbus/config";

export const prerender = true;

const SECTIONS = ["docs", "dsh", "dev", "changelog"] as const;
type Section = (typeof SECTIONS)[number];

interface SectionPage {
  title: string;
  description?: string;
  markdownUrl: string;
}

export function getStaticPaths() {
  return SECTIONS.map((section) => ({ params: { section } }));
}

async function sectionPages(section: Section): Promise<SectionPage[]> {
  if (section === "changelog") {
    const entries = await getCollection("changelog-zh", (entry) => isDiscoverable(entry));
    return entries
      .map((entry) => {
        const routeKey = entryRouteKey(entry.id);
        return {
          title: entry.data.title,
          description: entry.data.description,
          markdownUrl: routeKey
            ? `/zh/changelog/${routeKey}/index.md`
            : "/zh/changelog/index.md",
        };
      })
      .sort((a, b) => a.markdownUrl.localeCompare(b.markdownUrl));
  }
  const prefix = `/zh/${section}/`;
  return (await getIndexedEntries())
    .filter(
      (item) =>
        item.collection === "docs-zh" &&
        isDiscoverable(item.entry) &&
        item.url.startsWith(prefix),
    )
    .map((item) => ({
      title: item.title,
      description: item.description,
      markdownUrl: item.markdownUrl,
    }))
    .sort((a, b) => a.markdownUrl.localeCompare(b.markdownUrl));
}

export async function GET({ params }: { params: { section?: string } }) {
  const section = params.section as Section | undefined;
  if (!section || !SECTIONS.includes(section)) {
    return new Response("Not found", { status: 404 });
  }
  const origin = config.site.replace(/\/+$/, "");
  const lines = (await sectionPages(section)).map(
    (page) =>
      `- [${page.title}](${origin}${page.markdownUrl})${page.description ? ` — ${page.description}` : ""}`,
  );
  const body = [`# ${section}`, "", "## Pages", "", ...lines, ""].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
