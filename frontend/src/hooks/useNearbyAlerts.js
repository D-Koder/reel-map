import { useEffect, useRef } from 'react';
import { readJSON, writeJSON } from '../lib/storage';

// How close counts as "near", in metres.
export const NEAR_METRES = 200;
// At most one alert in this long, however many keen places are around.
export const COOLDOWN_MS = 15 * 60 * 1000;
const alertedKey = (userId) => `reelmap:near-alerted:${userId}`;
const lastAlertKey = (userId) => `reelmap:near-last-alert:${userId}`;

// Straight-line distance in metres between two [lng, lat] points.
export function distanceMetres([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// Keen places within NEAR_METRES of `here` that haven't been booked or done, nearest first.
// Each place counts once even when it's in several collections.
export function keenPlacesNear(places, userId, here) {
  const seen = new Set();
  return places
    .filter((p) => p.reactions?.[userId] === 'keen' && !p.booking?.done_at && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ place: p, metres: distanceMetres(here, [p.lng, p.lat]) }))
    .filter(({ metres }) => metres <= NEAR_METRES)
    .sort((a, b) => a.metres - b.metres)
    .filter(({ place }) => !seen.has(place.id) && seen.add(place.id));
}

// While the app is open, says when you're near a place you're keen on.
// Once per place per day, and never more than one alert every 15 minutes.
// Phones don't let web apps check location in the background, so this only runs on screen.
export function useNearbyAlerts({ userId, places, enabled, onNear }) {
  const latest = useRef({ places, onNear });
  latest.current = { places, onNear };

  useEffect(() => {
    if (!enabled || !userId || !navigator.geolocation) return undefined;
    const today = new Date().toDateString();
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (Date.now() - readJSON(lastAlertKey(userId), 0) < COOLDOWN_MS) return;
        const here = [position.coords.longitude, position.coords.latitude];
        const alerted = readJSON(alertedKey(userId), {});
        const fresh = keenPlacesNear(latest.current.places, userId, here).find(({ place }) => alerted[place.id] !== today);
        if (!fresh) return;
        // Only today's entries are kept, so the list doesn't grow forever.
        const keep = Object.fromEntries(Object.entries(alerted).filter(([, day]) => day === today));
        writeJSON(alertedKey(userId), { ...keep, [fresh.place.id]: today });
        writeJSON(lastAlertKey(userId), Date.now());
        latest.current.onNear(fresh.place, Math.round(fresh.metres));
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, userId]);
}
