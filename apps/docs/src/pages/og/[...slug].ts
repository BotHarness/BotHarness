import {
  getIndexedEntries,
  isDiscoverable,
} from "@cloudflare/nimbus-docs/runtime";
import { OGImageRoute } from "astro-og-canvas";
import { ogCardConfigFor } from "./_og-card-config";

export const prerender = true;

const entries = (await getIndexedEntries()).filter(
  (entry) =>
    entry.entry.collection !== "changelog-zh" && isDiscoverable(entry.entry),
);

const pages = Object.fromEntries(
  entries.map((entry) => {
    const routeId = entry.entry.id.replace(/(?:^|\/)index$/, "");
    const pathname = entry.url.replace(/\/$/, "");
    const prefix = routeId ? pathname.slice(0, -routeId.length) : pathname;
    return [
      `${prefix.replace(/\/$/, "")}/${entry.entry.id}`.replace(
        /^\/+|\/+$/g,
        "",
      ),
      {
        title: entry.title,
        description: entry.description ?? "",
      },
    ];
  }),
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    ...ogCardConfigFor(page),
  }),
});
