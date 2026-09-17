#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIAGRAMS = join(ROOT, 'docs', 'architecture', 'diagrams');
const RENDERED = join(DIAGRAMS, 'rendered');
const CONFIG = join(DIAGRAMS, 'mermaid.config.json');
const PUPPETEER_CONFIG = join(DIAGRAMS, 'puppeteer.json');
const MMDC = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');

// `-t default` for light, `-t dark` for the `.dark.svg` pair. `-b transparent`
// keeps the page background (and its theme) in charge.
const VARIANTS = [
  { suffix: '', theme: 'default' },
  { suffix: '.dark', theme: 'dark' },
];

// mmdc emits `width="100%"` with no intrinsic size, which makes `<img>`
// report a 300x150 natural size. Pin the viewBox dimensions on the root tag
// so the docs component can size and zoom the diagram correctly.
function pinIntrinsicSize(output) {
  const source = readFileSync(output, 'utf8');
  const box = source
    .match(/viewBox="([^"]+)"/)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!box || box.length !== 4 || !(box[2] > 0) || !(box[3] > 0)) return;

  const pinned = source.replace(/<svg\b[^>]*>/, (tag) => {
    if (!/\swidth="[^"]*"/.test(tag)) return tag;
    return tag.replace(/\swidth="[^"]*"/, ` width="${box[2]}" height="${box[3]}"`);
  });
  if (pinned !== source) writeFileSync(output, pinned, 'utf8');
}

function renderDiagram(source, output, theme) {
  execFileSync(
    MMDC,
    [
      '-i',
      source,
      '-o',
      output,
      '-t',
      theme,
      '-b',
      'transparent',
      '-c',
      CONFIG,
      '-p',
      PUPPETEER_CONFIG,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  pinIntrinsicSize(output);
}

export function renderDiagrams() {
  if (!existsSync(MMDC)) {
    throw new Error(`mmdc not found at ${MMDC} — run "corepack pnpm install" first`);
  }

  const sources = readdirSync(DIAGRAMS)
    .filter((name) => name.endsWith('.mmd'))
    .sort();
  mkdirSync(RENDERED, { recursive: true });

  for (const source of sources) {
    const base = source.replace(/\.mmd$/, '');
    for (const { suffix, theme } of VARIANTS) {
      const output = join(RENDERED, `${base}${suffix}.svg`);
      renderDiagram(join(DIAGRAMS, source), output, theme);
      process.stdout.write(
        `diagram: ${source} (${theme}) -> ${relative(ROOT, output)} (${statSync(output).size} bytes)\n`,
      );
    }
  }

  process.stdout.write(`diagram render complete: ${sources.length * VARIANTS.length} SVGs\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  renderDiagrams();
}
