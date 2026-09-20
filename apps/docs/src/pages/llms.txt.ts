import { getLlmsPayload } from "@cloudflare/nimbus-docs/agent-endpoints";
import { withBase } from "@cloudflare/nimbus-docs/runtime";
import { config } from "virtual:nimbus/config";
import { agentEndpointResponse } from "../utils/agent-endpoint-response";
import { DEVELOPMENT_STATUS_ROUTE } from "../lib/development-status-route";

export const prerender = true;

// Nimbus mounts the Chinese docs as a "version" (`versions.others`), and its
// site index intentionally omits version sections. Language variants are not
// older snapshots, so add the Chinese section link back by hand — otherwise
// `/zh/llms.txt` would be unreachable from the root agent index.
function withChineseSection(body: string): string {
  if (body.includes("/zh/llms.txt")) return body;
  const site = config.site ?? "http://localhost:4321";
  const href = new URL(withBase("/zh/llms.txt", import.meta.env.BASE_URL), site).href;
  return `${body.trimEnd()}\n- [中文](${href})\n`;
}

function withDevelopmentStatus(body: string): string {
  if (body.includes(DEVELOPMENT_STATUS_ROUTE.markdown.en)) return body;
  const site = config.site ?? "http://localhost:4321";
  const href = new URL(
    withBase(DEVELOPMENT_STATUS_ROUTE.markdown.en, import.meta.env.BASE_URL),
    site,
  ).href;
  return `${body.trimEnd()}\n- [Development status](${href})\n`;
}

// `changelog-zh` is the Chinese side of the changelog pairs, hand-mounted at
// `/zh/changelog`; Nimbus indexes it as a raw secondary collection, which
// would add a `/changelog-zh` section pointing at URLs that don't exist.
function withoutZhChangelogSection(body: string): string {
  return body.replace(/^- \[changelog-zh\]\([^\n]*\)\n/m, "");
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
    return {
      ...payload,
      body: withChineseSection(withDevelopmentStatus(withoutZhChangelogSection(payload.body))),
    };
  }, prerender);
}
