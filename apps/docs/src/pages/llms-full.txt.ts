import { getLlmsPayload } from "@cloudflare/nimbus-docs/agent-endpoints";
import { agentEndpointResponse } from "../utils/agent-endpoint-response";

export const prerender = true;

// `changelog-zh` is the Chinese side of the changelog pairs, hand-mounted at
// `/zh/changelog` (its agent index is `/zh/changelog/llms.txt`). Nimbus would
// otherwise include its entries here under `/changelog-zh/**` URLs that don't
// exist, so drop those blocks from the full export.
const ZH_CHANGELOG_URL = "/changelog-zh/";

function withoutZhChangelogBlocks(body: string): string {
  return body
    .split(/\n(?=# )/u)
    .filter((block) => !block.includes(ZH_CHANGELOG_URL))
    .join("\n");
}

export async function GET(context: { request: Request }) {
  return agentEndpointResponse(async () => {
    const payload = await getLlmsPayload(
      {
        scope: "site",
        surface: "full",
      },
      context,
    );
    if (!payload) return null;
    return { ...payload, body: withoutZhChangelogBlocks(payload.body) };
  }, prerender);
}
