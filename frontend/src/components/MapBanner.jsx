import React, { useState } from 'react';
import { Coffee, PartyPopper, UtensilsCrossed } from 'lucide-react';
import PlaceThumb from './PlaceThumb';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const PIN_ICONS = { cafe: Coffee, event: PartyPopper, food: UtensilsCrossed };

// A Mapbox Static Images map centred on the place. Mapbox's logo and attribution stay on the image.
function staticMapUrl(style, lng, lat) {
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${lng},${lat},14.5,0/640x240@2x?access_token=${MAPBOX_TOKEN}`;
}

// A wide map of the area around a place, with the same pin as the Map tab (category icon or the
// place's emoji, plus its first letter) in the middle. Dark map in dark mode, light map in light mode.
// Falls back to the colour tile when there is no Mapbox token, no location, or the map won't load.
export default function MapBanner({ place, className }) {
  const [failed, setFailed] = useState(false);
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  const located = place.lat != null && place.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng);
  if (!MAPBOX_TOKEN || !located || failed) return <PlaceThumb place={place} className={className} />;

  const Icon = PIN_ICONS[place.category] ?? UtensilsCrossed;
  const initial = [...String(place.name || '').trim()][0]?.toLocaleUpperCase();
  return (
    <span className={`${className} map-banner`}>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={staticMapUrl('dark-v11', lng, lat)} />
        <img src={staticMapUrl('light-v11', lng, lat)} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      </picture>
      <span className="map-banner-pin mapbox-pin" aria-hidden="true">
        <span className="pin-marker">
          <span className="pin-marker-label">
            {place.emoji
              ? <span className="pin-marker-label-emoji">{place.emoji}</span>
              : <Icon className="pin-marker-icon" />}
            {initial && <span className="pin-marker-letter">{initial}</span>}
          </span>
        </span>
      </span>
    </span>
  );
}
