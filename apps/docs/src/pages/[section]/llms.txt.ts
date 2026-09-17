/**
 * `/docs/llms.txt`, `/dev/llms.txt`, `/changelog/llms.txt` — per-section agent
 * indexes. `changelog-zh` is the Chinese changelog tree mounted by hand at
 * `/zh/changelog`; its agent index lives at `/zh/changelog/llms.txt` (see
 * `src/pages/zh/[section]/llms.txt.ts`). Nimbus would otherwise emit a raw
 * `/changelog-zh/llms.txt` section whose URLs don't exist, so drop it here.
 */
import {
  getLlmsPayload,
  getLlmsStaticPaths,
  type LlmsEndpointReference,
} from "@cloudflare/nimbus-docs/agent-endpoints";
import { agentEndpointResponse } from "../../utils/agent-endpoint-response";

export const prerender = true;

interface SectionProps {
  reference: LlmsEndpointReference;
}

interface SectionContext {
  params: { section?: string };
  props: Partial<SectionProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  (await getLlmsStaticPaths()).filter((path) => path.params.section !== "changelog-zh");

export async function GET({ params, props, request }: SectionContext) {
  const reference =
    props.reference ??
    (params.section
      ? ({
          scope: "section",
          surface: "index",
          section: params.section,
        } satisfies LlmsEndpointReference)
      : null);
  if (!reference) return new Response("Not found", { status: 404 });
  return agentEndpointResponse(() =>
    getLlmsPayload(reference, {
      request,
    }),
    prerender,
  );
}
