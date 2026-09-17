import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";
import { ogCardConfigFor } from "../../_og-card-config";

/**
 * Chinese changelog OG cards — `/og/zh/changelog/<id>.png`, from the
 * `changelog-zh` tree (`docs/changelog/*.zh.md`). Mirrors the English
 * route at `og/changelog/[...slug].ts`; `ogCardConfigFor` picks up the
 * CJK font automatically when the drawn title contains Han characters.
 */
const entries = await getCollection("changelog-zh", (entry) => !entry.data.draft);

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
