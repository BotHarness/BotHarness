import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'packages/client/assets/bot');
const target = join(root, 'packages/client/src/client/bot-icon-assets.ts');

const sources = [
  ['DEEPSEEKBOT_LIGHT_DATA_URI', 'deepseekbot-light.png'],
  ['DEEPSEEKBOT_DARK_DATA_URI', 'deepseekbot-dark.png'],
  ['DEEPSEEKBOT_TRANSPARENT_DATA_URI', 'deepseekbot-transparent.png'],
  ['DEEPSEEKBOT_SIMPLE_LIGHT_DATA_URI', 'deepseekbot-simple-light.png'],
  ['DEEPSEEKBOT_SIMPLE_DARK_DATA_URI', 'deepseekbot-simple-dark.png'],
  ['DEEPSEEKBOT_SIMPLE_TRANSPARENT_DATA_URI', 'deepseekbot-simple-transparent.png'],
];

const lines = [];

for (const [name, file] of sources) {
  const bytes = readFileSync(join(assets, file));
  lines.push(`export const ${name} =`);
  lines.push(`  'data:image/png;base64,${bytes.toString('base64')}';`);
  lines.push('');
}

writeFileSync(target, `${lines.join('\n')}`);
console.log(`bot icons: wrote ${target} (${sources.length} assets)`);
