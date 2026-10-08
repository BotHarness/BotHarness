import type { ReactElement } from 'react';
import {
  BANNER_HEIGHT,
  BANNER_WIDTH,
  pixelBannerPixels,
  seededBannerRecipe,
  type PixelBannerRecipe,
} from '@botharness/pixel-banner';

import { useMountedResource } from './mounted-resource.js';
import type { BotBannerView } from './store.js';

export function bannerOf(banner: BotBannerView | undefined, name: string): BotBannerView {
  return banner ?? { recipe: seededBannerRecipe(name) };
}

function BannerCanvas({
  recipe,
  className,
}: {
  recipe: PixelBannerRecipe;
  className: string;
}): ReactElement {
  const paint = useMountedResource<HTMLCanvasElement>(
    (canvas) => {
      const context = canvas.getContext('2d');
      if (context === null) return;
      const { data, width, height } = pixelBannerPixels(recipe);
      context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    },
    [recipe.scene, recipe.seed],
  );
  return (
    <canvas
      ref={paint}
      className={className}
      width={BANNER_WIDTH}
      height={BANNER_HEIGHT}
      data-scene={recipe.scene}
      aria-hidden="true"
    />
  );
}

export function BotBannerArt({
  banner,
  className = 'bh-banner-art',
}: {
  banner: BotBannerView;
  className?: string;
}): ReactElement {
  if ('image' in banner) {
    return <img className={className} src={banner.image} alt="" draggable={false} />;
  }
  return <BannerCanvas recipe={banner.recipe} className={className} />;
}
