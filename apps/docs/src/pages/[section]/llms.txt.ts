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
import { getIndexedEntries, isDiscoverable, withBase } from "@cloudflare/nimbus-docs/runtime";
import { config } from "virtual:nimbus/config";
import { renderDevLlms } from "../../lib/dev-llms";
import { agentEndpointResponse } from "../../utils/agent-endpoint-response";
import { DEVELOPMENT_STATUS_ROUTE } from "../../lib/development-status-route";

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

function withChineseDevelopmentStatus(body: string): string {
  if (body.includes(DEVELOPMENT_STATUS_ROUTE.markdown.zh)) return body;
  const origin = config.site.replace(/\/+$/, "");
  const path = withBase(DEVELOPMENT_STATUS_ROUTE.markdown.zh, import.meta.env.BASE_URL);
  return `${body.trimEnd()}\n- [开发状态](${origin}${path})\n`;
}

export async function GET({ params, props, request }: SectionContext) {
  if (params.section === "dev") {
    const pages = (await getIndexedEntries())
      .filter(
        (item) =>
          item.collection === "docs" &&
          isDiscoverable(item.entry) &&
          (item.url === "/dev" || item.url.startsWith("/dev/")),
      )
      .map((item) => ({
        title: item.title,
        description: item.description,
        url: item.url,
      }));
    return new Response(
      renderDevLlms({
        origin: config.site.replace(/\/+$/, ""),
        language: "en",
        pages,
      }),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
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
  return agentEndpointResponse(async () => {
    const payload = await getLlmsPayload(reference, {
      request,
    });
    if (!payload || params.section !== "zh") return payload;
    return { ...payload, body: withChineseDevelopmentStatus(payload.body) };
  }, prerender);
}
