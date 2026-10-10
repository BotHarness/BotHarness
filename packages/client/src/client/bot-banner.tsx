import { useState, type ReactElement } from 'react';
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
      if (typeof ImageData === 'undefined') return;
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
  const [failed, setFailed] = useState<string>();
  if ('image' in banner) {
    if (banner.image === failed) return <span className={className} data-banner-failed="true" />;
    return (
      <img
        className={className}
        src={banner.image}
        alt=""
        draggable={false}
        onError={() => setFailed(banner.image)}
      />
    );
  }
  return <BannerCanvas recipe={banner.recipe} className={className} />;
}
