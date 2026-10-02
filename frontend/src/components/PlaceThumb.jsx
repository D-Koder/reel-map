import React, { useState } from 'react';
import { categoryIcon } from '../lib/constants';
import { normalizeImageUrl } from '../lib/media';

// Reel thumbnail when we have one (and it loads), otherwise the category icon.
export default function PlaceThumb({ place, className }) {
  const [failed, setFailed] = useState(false);
  const src = normalizeImageUrl(place.reel_thumbnail_url);
  const showImage = src && !failed;

  return (
    <span className={`${className} ${showImage ? 'has-image' : ''}`}>
      {showImage ? (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        categoryIcon(place.category)
      )}
    </span>
  );
}
