#!/usr/bin/env node
/**
 * sync-slides.mjs — build the presentations workspace and embed the static
 * output into the docs site.
 *
 * Source of truth: `apps/presentations/slides/<id>/index.tsx` (one deck per
 * folder; authoring rules live in `apps/presentations/AGENTS.md`).
 *
 * Generated output: `apps/docs/public/slides/`, served at
 * `botharness.ai/slides/`. That directory is gitignored and rebuilt by
 * `pnpm slides:build` — never hand-edit it.
 *
 * The deck is built with `OPEN_SLIDE_BASE=/slides/` so asset URLs resolve
 * under the docs subpath. Local iteration keeps base `/`:
 * `pnpm slides:dev` → http://localhost:5173/s/<id>.
 *
 * Workers static assets rejects a self-prefix SPA fallback (`/slides/s/*` →
 * `/slides/index.html` trips its redirect-loop validator), so deep links are
 * served as static copies instead: every deck id gets `s/<id>/index.html` and
 * `s/<id>/presenter/index.html` cloned from the SPA shell. The client router
 * takes over from there; asset URLs are absolute so they resolve anywhere.
 *
 * open-slide emits a scaffold shell (`<title>open-slide</title>`, no meta), so
 * this script also injects per-route SEO: home plus one title/description per
 * deck (read from each deck's `meta.title`), with canonical URLs and the docs
 * brand favicon/OG card. Presenter copies are `noindex` to avoid duplicate
 * indexing of the same deck.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://botharness.ai';
const HOME_TITLE = 'BotHarness Slides';
const HOME_DESCRIPTION =
  'BotHarness 介绍与分享 Slides：PersonaBot、记忆、执行与委派，一套幻灯片讲清楚。Intro decks for the BotHarness DSH plugin layer.';

const headTags = ({ title, description, canonical, noindex = false }) =>
  [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="BotHarness" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${SITE}/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${SITE}/og.png" />`,
    `<meta name="theme-color" content="#0a0f14" />`,
    ...(noindex ? [`<meta name="robots" content="noindex" />`] : []),
  ].join('\n    ');

const injectSeo = (html, head) => {
  let out = html.replace('<html lang="en">', '<html lang="zh-CN">');
  out = out.replace(/<link rel="icon" href="[^"]*" \/>/, '<link rel="icon" href="/favicon.ico" />');
  return out.replace(/<title>[^<]*<\/title>/, head);
};

const deckTitle = (id) => {
  const source = readFileSync(resolve(SLIDES_DIR, id, 'index.tsx'), 'utf8');
  return source.match(/title:\s*'([^']+)'/)?.[1] ?? id;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLIDES_DIR = resolve(ROOT, 'apps', 'presentations', 'slides');
const TARGET = resolve(ROOT, 'apps', 'docs', 'public', 'slides');

rmSync(TARGET, { recursive: true, force: true });
execFileSync(
  'pnpm',
  ['--filter', '@botharness/presentations', 'exec', 'open-slide', 'build', '--out-dir', TARGET],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, OPEN_SLIDE_BASE: '/slides/' },
  },
);

const shell = resolve(TARGET, 'index.html');
const raw = readFileSync(shell, 'utf8');

writeFileSync(
  shell,
  injectSeo(
    raw,
    headTags({
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      canonical: `${SITE}/slides/`,
    }),
  ),
);
console.log('slides SEO → /slides/');

for (const id of readdirSync(SLIDES_DIR)) {
  if (id.startsWith('.')) continue;
  if (!statSync(resolve(SLIDES_DIR, id)).isDirectory()) continue;
  const title = deckTitle(id);
  const routes = [
    { route: `s/${id}`, noindex: false, canonical: `${SITE}/slides/s/${id}/` },
    { route: `s/${id}/presenter`, noindex: true, canonical: `${SITE}/slides/s/${id}/` },
  ];
  for (const { route, noindex, canonical } of routes) {
    const dir = resolve(TARGET, route);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, 'index.html'),
      injectSeo(
        raw,
        headTags({
          title: `${title}｜${HOME_TITLE}`,
          description: `${title} —— ${HOME_DESCRIPTION}`,
          canonical,
          noindex,
        }),
      ),
    );
    console.log(`slides route → /slides/${route}/`);
  }
}
console.log(`slides → ${TARGET}`);
