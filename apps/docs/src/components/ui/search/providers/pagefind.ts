import type { SearchProvider, SearchResult } from "@cloudflare/nimbus-docs/types";
import { config } from "virtual:nimbus/config";
import { normalizeLocale, searchStrings } from "@/lib/language";

interface PagefindSubResult {
  title?: string;
  url?: string;
}

interface PagefindResultData {
  url: string;
  excerpt?: string;
  meta?: { title?: string };
  sub_results?: PagefindSubResult[];
}

interface PagefindSearchResponse {
  results: Array<{ data(): Promise<PagefindResultData> }>;
}

interface PagefindFilters {
  [key: string]: string | string[] | { none?: string | string[]; any?: string | string[] };
}

interface PagefindApi {
  init(): Promise<void>;
  search(query: string, options?: { filters?: PagefindFilters }): Promise<PagefindSearchResponse>;
}

let pagefind: PagefindApi | undefined;

function withBase(url: string): string {
  if (!url.startsWith("/")) return url;
  const base = `/${(import.meta.env.BASE_URL ?? "/").replace(/^\/+|\/+$/g, "")}`;
  if (base === "/" || url === base || url.startsWith(`${base}/`)) return url;
  return `${base}${url}`;
}

const defaultFilters: PagefindFilters | undefined =
  config.versions && config.versions.deprecated && config.versions.deprecated.length > 0
    ? { status: { none: "deprecated" } }
    : undefined;

export const provider: SearchProvider = {
  async init() {
    if (pagefind) return;
    const baseUrl = new URL(import.meta.env.BASE_URL ?? "/", window.location.origin);
    const pagefindUrl = new URL("pagefind/pagefind.js", baseUrl);
    pagefind = (await import(/* @vite-ignore */ pagefindUrl.href)) as PagefindApi;
    await pagefind.init();
  },

  async search(query) {
    if (!pagefind) await this.init?.();
    if (!pagefind) return [];

    const search = await pagefind.search(
      query,
      defaultFilters ? { filters: defaultFilters } : undefined,
    );
    const results = await Promise.all(search.results.slice(0, 10).map((result) => result.data()));
    const { untitled } = searchStrings(normalizeLocale(document.documentElement.lang));
    return results.map((result): SearchResult => ({
      title: result.meta?.title ?? untitled,
      url: withBase(result.url),
      snippet: result.excerpt,
      subResults: result.sub_results
        ?.filter((sub): sub is Required<PagefindSubResult> => Boolean(sub.title && sub.url))
        .map((sub) => ({ title: sub.title, url: withBase(sub.url) })),
    }));
  },
};
