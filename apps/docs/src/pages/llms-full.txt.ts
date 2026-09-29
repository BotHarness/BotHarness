import { getLlmsPayload } from "@cloudflare/nimbus-docs/agent-endpoints";
import { agentEndpointResponse } from "../utils/agent-endpoint-response";

export const prerender = true;

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
