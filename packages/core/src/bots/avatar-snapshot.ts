import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';

import {
  canonicalAvatarRecipe,
  illustratedAvatarSvg,
  isIllustratedAvatarRecipe,
  type AvatarAppearance,
} from './avatar-appearance.js';
import { isPersonaBotAvatar } from './persona-bot.js';

export function deriveAvatarAppearance(
  value: unknown,
): { appearance: AvatarAppearance; avatar: string } | undefined {
  if (!isIllustratedAvatarRecipe(value)) return undefined;
  const recipe = canonicalAvatarRecipe(value);
  const renderer = new Resvg(illustratedAvatarSvg(recipe), { font: { loadSystemFonts: false } });
  const png = renderer.render().asPng();
  const avatar = `data:image/png;base64,${png.toString('base64')}`;
  if (!isPersonaBotAvatar(avatar)) return undefined;
  const revision = createHash('sha256').update(JSON.stringify(recipe)).update(png).digest('hex');
  return { appearance: { recipe, revision }, avatar };
}
