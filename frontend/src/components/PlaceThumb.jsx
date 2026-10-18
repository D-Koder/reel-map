import React from 'react';
import { Coffee, MapPin, PartyPopper, UtensilsCrossed } from 'lucide-react';

const CATEGORY_ICONS = { cafe: Coffee, food: UtensilsCrossed, event: PartyPopper, other: MapPin };

// A tile in the category's colour with the place's emoji or the category icon.
// Reels show their platform's own embed instead (ReelEmbedThumb); no reel cover image is copied.
export default function PlaceThumb({ place, className }) {
  const category = CATEGORY_ICONS[place.category] ? place.category : 'other';
  const Icon = CATEGORY_ICONS[category] ?? MapPin;

  return (
    <span className={`${className} thumb cat-${category}`}>
      {place.emoji ? (
        <span className="thumb-emoji" aria-hidden="true">{place.emoji}</span>
      ) : (
        <Icon className="thumb-icon" aria-hidden="true" strokeWidth={1.75} />
      )}
    </span>
  );
}
