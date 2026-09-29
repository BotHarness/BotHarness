import { getLlmsPayload } from "@cloudflare/nimbus-docs/agent-endpoints";
import { withBase } from "@cloudflare/nimbus-docs/runtime";
import { config } from "virtual:nimbus/config";
import { agentEndpointResponse } from "../utils/agent-endpoint-response";
import { DEVELOPMENT_STATUS_ROUTE } from "../lib/development-status-route";

export const prerender = true;

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
