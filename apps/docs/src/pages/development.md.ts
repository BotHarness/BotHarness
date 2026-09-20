import { developmentStatusMarkdownResponse } from "@/lib/development-status";

export const prerender = true;

export function GET(): Response {
  return developmentStatusMarkdownResponse("en");
}
