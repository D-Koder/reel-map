import React, { useEffect, useState } from 'react';
import { MAPBOX_TOKEN, addressAt } from '../lib/mapboxSearch';

// Looked-up spots, kept while the app is open, so a list shown again doesn't ask Mapbox twice.
const found = new Map();

// The spot in a Google Maps place link: "…!3d-37.81!4d144.96…" → [144.96, -37.81].
function spotInLink(url) {
  const match = String(url || '').match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  return match ? [Number(match[2]), Number(match[1])] : null;
}

// The second line of a Google Maps result: its street, suburb and state, then its kind and rating.
// Google's list often leaves the address out, so the street and suburb come from Mapbox, by the
// spot in the result's link. While that loads (or with no spot), Google's own text is shown.
export default function CandidateAddress({ candidate, fallback = 'Google Maps place' }) {
  const spot = spotInLink(candidate.url);
  const key = spot?.join(',');
  const [where, setWhere] = useState(() => (key ? found.get(key) : null));

  useEffect(() => {
    if (!key || !MAPBOX_TOKEN) return undefined;
    if (found.has(key)) {
      setWhere(found.get(key));
      return undefined;
    }
    const controller = new AbortController();
    addressAt(spot[0], spot[1], controller.signal)
      .then((result) => {
        found.set(key, result);
        setWhere(result);
      })
      .catch(() => {});
    return () => controller.abort();
    // The spot's key is what matters, not the array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const street = candidate.address || where?.street || '';
  const area = where?.area && !street.includes(where.area.split(' ')[0]) ? where.area : '';
  const text = [[street, area].filter(Boolean).join(', '), candidate.category, candidate.rating && `★ ${candidate.rating}`]
    .filter(Boolean).join(' · ');
  return text || candidate.summary || fallback;
}
