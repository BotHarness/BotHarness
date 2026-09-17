import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";
import { ogCardConfigFor } from "../_og-card-config";

const entries = await getCollection("changelog", (entry) => !entry.data.draft);

const pages = Object.fromEntries(
  entries.map((entry) => [
    entry.id,
    { title: entry.data.title, description: entry.data.description ?? "" },
  ]),
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    ...ogCardConfigFor(page),
  }),
});
