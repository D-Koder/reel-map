import React, { useState } from 'react';
import { Coffee, MapPin, PartyPopper, Play, UtensilsCrossed } from 'lucide-react';
import { normalizeImageUrl } from '../lib/media';

const CATEGORY_ICONS = { cafe: Coffee, food: UtensilsCrossed, event: PartyPopper };

// The reel's cover when there is one and it loads. Instagram cover links expire,
// so the fallback is a tile in the category's colour with its icon.
export default function PlaceThumb({ place, className, onBroken }) {
  // Links that failed, so the next one gets a try: the fresh cover first, then the one saved with the place.
  const [failed, setFailed] = useState(() => new Set());
  const sources = [...new Set([place.reel_thumbnail_url, place.saved_thumbnail_url].map(normalizeImageUrl).filter(Boolean))];
  const src = sources.find((candidate) => !failed.has(candidate));
  const showImage = Boolean(src);
  const category = CATEGORY_ICONS[place.category] ? place.category : 'other';
  const Icon = CATEGORY_ICONS[category] ?? MapPin;

  return (
    <span className={`${className} thumb cat-${category} ${showImage ? 'has-image' : ''}`}>
      {showImage ? (
        <>
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => {
              setFailed((current) => new Set(current).add(src));
              onBroken?.();
            }}
          />
          {place.reel_url && (
            <span className="thumb-play" aria-hidden="true">
              <Play fill="currentColor" strokeWidth={0} />
            </span>
          )}
        </>
      ) : place.emoji ? (
        <span className="thumb-emoji" aria-hidden="true">{place.emoji}</span>
      ) : (
        <Icon className="thumb-icon" aria-hidden="true" strokeWidth={1.75} />
      )}
    </span>
  );
}
