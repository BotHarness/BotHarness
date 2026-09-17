/**
 * Per-entry `/zh/changelog/<slug>/index.mdx` — expanded source alternate of
 * the Chinese changelog permalink. Mirrors the English route at
 * `src/pages/changelog/[...slug]/index.mdx.ts`.
 */
import {
  getMarkdownPayload,
  getMarkdownStaticPaths,
  type MarkdownEndpointReference,
} from "@cloudflare/nimbus-docs/agent-endpoints";

export const prerender = true;

interface SlugProps {
  reference: MarkdownEndpointReference;
}

interface SlugContext {
  params: { slug?: string };
  props: Partial<SlugProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  getMarkdownStaticPaths({ collection: "changelog-zh", surface: "source" })
    .then((paths) => paths.filter((path) => path.params.slug !== undefined));

export async function GET({ params, props, request }: SlugContext) {
  const payload = await getMarkdownPayload({
    collection: "changelog-zh",
    surface: "source",
    slug: params.slug,
    reference: props.reference,
    context: { request },
  });
  if (!payload) return new Response("Not found", { status: 404 });
  return new Response(payload.body, {
    headers: { "Content-Type": payload.mediaType },
  });
}
