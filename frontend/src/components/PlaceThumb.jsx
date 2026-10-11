import React, { useState } from 'react';
import { Coffee, MapPin, PartyPopper, Play, UtensilsCrossed } from 'lucide-react';
import { normalizeImageUrl } from '../lib/media';

const CATEGORY_ICONS = { cafe: Coffee, food: UtensilsCrossed, event: PartyPopper };

// The reel's cover when there is one and it loads. Instagram cover links expire,
// so the fallback is a tile in the category's colour with its icon.
export default function PlaceThumb({ place, className }) {
  const [failed, setFailed] = useState(false);
  const src = normalizeImageUrl(place.reel_thumbnail_url);
  const showImage = src && !failed;
  const category = CATEGORY_ICONS[place.category] ? place.category : 'other';
  const Icon = CATEGORY_ICONS[category] ?? MapPin;

  return (
    <span className={`${className} thumb cat-${category} ${showImage ? 'has-image' : ''}`}>
      {showImage ? (
        <>
          <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
          {place.reel_url && (
            <span className="thumb-play" aria-hidden="true">
              <Play fill="currentColor" strokeWidth={0} />
            </span>
          )}
        </>
      ) : (
        <Icon className="thumb-icon" aria-hidden="true" strokeWidth={1.75} />
      )}
    </span>
  );
}
