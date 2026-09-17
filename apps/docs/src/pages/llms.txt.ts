import { getLlmsPayload } from "@cloudflare/nimbus-docs/agent-endpoints";
import { withBase } from "@cloudflare/nimbus-docs/runtime";
import { config } from "virtual:nimbus/config";
import { agentEndpointResponse } from "../utils/agent-endpoint-response";

export const prerender = true;

// Nimbus models the English docs as a "version" (`versions.others`), and its
// site index intentionally omits version sections. Language variants are not
// older snapshots, so add the English section link back by hand — otherwise
// `/en/llms.txt` would be unreachable from the root agent index.
function withEnglishSection(body: string): string {
  if (body.includes("/en/llms.txt")) return body;
  const site = config.site ?? "http://localhost:4321";
  const href = new URL(withBase("/en/llms.txt", import.meta.env.BASE_URL), site).href;
  return `${body.trimEnd()}\n- [English](${href})\n`;
}

export async function GET(context: { request: Request }) {
  return agentEndpointResponse(async () => {
    const payload = await getLlmsPayload(
      {
        scope: "site",
        surface: "index",
      },
      context,
    );
    if (!payload) return null;
    return { ...payload, body: withEnglishSection(payload.body) };
  }, prerender);
}
