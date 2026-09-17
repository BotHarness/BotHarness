/**
 * Per-entry `/en/changelog/<slug>/index.mdx` — expanded source alternate of
 * the English (untranslated-fallback) changelog permalink. Mirrors the Chinese
 * route at `src/pages/changelog/[...slug]/index.mdx.ts`.
 */
import {
  getMarkdownPayload,
  getMarkdownStaticPaths,
  type MarkdownEndpointReference,
} from "@cloudflare/nimbus-docs/agent-endpoints";
import { agentEndpointResponse } from "@/utils/agent-endpoint-response";

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
  getMarkdownStaticPaths({ collection: "changelog", surface: "source" })
    .then((paths) => paths.filter((path) => path.params.slug !== undefined));

export async function GET({ params, props, request }: SlugContext) {
  return agentEndpointResponse(
    () =>
      getMarkdownPayload({
        collection: "changelog",
        surface: "source",
        slug: params.slug,
        reference: props.reference,
        context: { request },
      }),
    prerender,
  );
}
