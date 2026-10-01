import React, { useMemo, useState } from 'react';
import { getVibe, mapFilters } from '../lib/constants';
import PlaceThumb from './PlaceThumb';

// Placeholder map until Mapbox arrives in phase 3: pins are laid out from their real
// coordinates, scaled to fit the box. Bounds use every located place so pins don't jump when filtering.
function usePinLayout(places) {
  return useMemo(() => {
    const located = places.filter((p) => p.venue?.lat != null && p.venue?.lng != null);
    if (located.length === 0) return { positions: {}, unlocated: places.length };

    const lats = located.map((p) => p.venue.lat);
    const lngs = located.map((p) => p.venue.lng);
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
    const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
    const latSpan = maxLat - minLat || 1;
    const lngSpan = maxLng - minLng || 1;

    // Keep pins clear of the filter chips (top) and the label (bottom).
    const scale = (value, min, span) => (located.length === 1 ? 0.5 : (value - min) / span);
    const positions = Object.fromEntries(
      located.map((p) => [
        p.id,
        {
          top: `${18 + (1 - scale(p.venue.lat, minLat, latSpan)) * 64}%`,
          left: `${10 + scale(p.venue.lng, minLng, lngSpan) * 76}%`,
        },
      ])
    );
    return { positions, unlocated: places.length - located.length };
  }, [places]);
}

export default function MapScreen({ places, membersOf, onOpenPin, showToast }) {
  const [filter, setFilter] = useState('all');
  const { positions, unlocated } = usePinLayout(places);

  const selectFilter = (id) => {
    setFilter(id);
    const label = id === 'all' ? 'All' : id.charAt(0).toUpperCase() + id.slice(1);
    showToast(`🔍 Showing ${label}`);
  };

  const visible = places.filter((p) => positions[p.id] && (filter === 'all' || p.category === filter));

  return (
    <div className="screen map-screen">
      <div className="fake-map">
        <div className="map-controls" role="toolbar" aria-label="Filter pins">
          {mapFilters.map((f) => (
            <button
              key={f.id}
              className={`map-filter ${filter === f.id ? 'active' : ''}`}
              onClick={() => selectFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="map-title">
          📍 {visible.length} {visible.length === 1 ? 'place' : 'places'}
          {unlocated > 0 && <span className="map-title-note"> · {unlocated} without a location yet</span>}
        </div>

        {visible.map((p) => {
          const members = membersOf[p.collection_id] ?? [];
          const vibe = getVibe(
            members.map((m) => m.id),
            p.reactions
          );
          return (
            <button
              key={p.id}
              className="map-pin"
              style={positions[p.id]}
              onClick={() => onOpenPin(p.id)}
              aria-label={p.name}
            >
              <span className={`pin-marker ${vibe.consensus}`}>
                <PlaceThumb place={p} className="pin-marker-emoji" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
