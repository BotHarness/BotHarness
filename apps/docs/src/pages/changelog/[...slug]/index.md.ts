/**
 * Per-entry `/changelog/<slug>/index.md` — the clean-markdown alternate.
 * Mirrors the primary docs alternate, scoped to the `changelog` collection,
 * adding the entry's date + tags to the frontmatter.
 */
import { entryRouteKey, withBase } from "@cloudflare/nimbus-docs";
import { getEntry } from "astro:content";
import {
  getMarkdownPayload,
  getMarkdownStaticPaths,
  type MarkdownEndpointReference,
} from "@cloudflare/nimbus-docs/agent-endpoints";
import { config } from "virtual:nimbus/config";

export const prerender = true;

const COLLECTION = "changelog";
const absoluteUrl = (path: string) =>
  new URL(withBase(path, import.meta.env.BASE_URL), config.site).href;

interface SlugProps {
  reference: MarkdownEndpointReference;
}

interface SlugContext {
  params: { slug?: string };
  props: Partial<SlugProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  getMarkdownStaticPaths({ collection: COLLECTION, surface: "markdown" })
    .then((paths) => paths.filter((path) => path.params.slug !== undefined));

export async function GET({ params, props, request }: SlugContext) {
  const payload = await getMarkdownPayload({
    collection: COLLECTION,
    surface: "markdown",
    slug: params.slug,
    reference: props.reference,
    context: { request },
  });
  if (!payload) return new Response(null, { status: 404 });
  const entry = await getEntry(COLLECTION, payload.id);
  if (!entry) return new Response(null, { status: 404 });
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const title = String(data.title);
  const description =
    typeof data.description === "string" ? data.description : undefined;

  const date =
    data.date instanceof Date
      ? data.date.toISOString().slice(0, 10)
      : undefined;
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  const routeKey = entryRouteKey(entry.id);
  const sourcePath = routeKey
    ? `/changelog/${routeKey}/index.mdx`
    : "/changelog/index.mdx";

  const rawImage = data.socialImage;
  const socialImage =
    typeof rawImage === "string" && rawImage.length > 0
      ? rawImage
      : config.socialImage;

  const body = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    ...(date ? [`date: ${date}`] : []),
    ...(tags.length
      ? [`tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`]
      : []),
    ...(socialImage
      ? [`image: ${JSON.stringify(absoluteUrl(socialImage))}`]
      : []),
    "---",
    "",
    "> Documentation Index",
    `> Fetch the complete documentation index at: ${absoluteUrl("/llms.txt")}`,
    "> Use this file to discover all available pages before exploring further.",
    "",
    `# ${title}`,
    "",
    payload.content,
    "",
    `Source: ${absoluteUrl(sourcePath)}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
