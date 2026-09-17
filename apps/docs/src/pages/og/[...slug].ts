import {
  getIndexedEntries,
  isDiscoverable,
} from "@cloudflare/nimbus-docs/runtime";
import { OGImageRoute } from "astro-og-canvas";
import { ogCardConfigFor } from "./_og-card-config";

// Prerender every OG card as a static asset so `output: "server"` doesn't
// turn image generation into an on-demand route.
export const prerender = true;

// Enumerate via the framework projection (not a raw `getCollection`) so draft
// entries are excluded uniformly — a draft page emits no route, so its
// `/og/<id>.png` shouldn't either.
//
// `changelog-zh` is the Chinese changelog tree, hand-mounted at `/zh/changelog`;
// its pages share the English cards (`/og/changelog/<slug>.png`), so it gets no
// `/og/changelog-zh/**` cards of its own.
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
