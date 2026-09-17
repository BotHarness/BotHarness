/**
 * Per-page `/en/<slug>/index.mdx` — expanded source alternate of every
 * indexable entry of the `docs-en` collection. Mirrors the primary source
 * route at `src/pages/[...slug]/index.mdx.ts`.
 */
import {
  getMarkdownPayload,
  getMarkdownStaticPaths,
  type MarkdownEndpointReference,
} from "@cloudflare/nimbus-docs/agent-endpoints";
import { agentEndpointResponse } from "../../../utils/agent-endpoint-response";

export const prerender = true;

const COLLECTION = "docs-en";

interface SlugProps {
  reference: MarkdownEndpointReference;
}

interface SlugContext {
  params: { slug?: string };
  props: Partial<SlugProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  getMarkdownStaticPaths({
    collection: COLLECTION,
    surface: "source",
  });

export async function GET({ params, props, request }: SlugContext) {
  return agentEndpointResponse(() =>
    getMarkdownPayload({
      collection: COLLECTION,
      surface: "source",
      slug: params.slug,
      reference: props.reference,
      context: { request },
    }),
    prerender,
  );
}
