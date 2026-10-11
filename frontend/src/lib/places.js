// Two saved places are at the same spot when their coordinates match to about a metre.
const SAME_SPOT_DEGREES = 0.00001;

// Saved places (one per entry) that sit at this exact location.
export function entriesAtSpot(places, latitude, longitude) {
  const seen = new Set();
  return places.filter((place) => {
    if (seen.has(place.id) || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
    if (Math.abs(place.lat - latitude) >= SAME_SPOT_DEGREES || Math.abs(place.lng - longitude) >= SAME_SPOT_DEGREES) return false;
    seen.add(place.id);
    return true;
  });
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// How far the address can be from the saved pin and still count as the same place.
const ADDRESS_MATCH_METRES = 300;

function metresBetween(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

const hasCoords = (place) => Number.isFinite(place.lat) && Number.isFinite(place.lng);
const coordsLink = (place) => `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;

// The Google Maps link to open for a place: its own Google Maps page when it came from there,
// otherwise a search for its name and address so Google shows the business.
export function googleMapsLink(place) {
  if (/^https:\/\/www\.google\.[a-z.]+\/maps\/place\//.test(place.source_id ?? '')) return place.source_id;
  if (!place.address) return hasCoords(place) ? coordsLink(place) : null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.venue_name ?? place.name}, ${place.address}`)}`;
}

// Same link, but falls back to the saved pin when the address is somewhere else (or can't be found),
// so Google doesn't open the wrong spot.
export async function checkedGoogleMapsLink(place, signal) {
  const link = googleMapsLink(place);
  if (link === place.source_id || !place.address || !hasCoords(place) || !MAPBOX_TOKEN) return link;
  try {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place.address)}.json`);
    url.searchParams.set('access_token', MAPBOX_TOKEN);
    url.searchParams.set('limit', '1');
    url.searchParams.set('types', 'address,poi');
    url.searchParams.set('proximity', `${place.lng},${place.lat}`);
    const response = await fetch(url, { signal });
    if (!response.ok) return link;
    const [lng, lat] = (await response.json()).features?.[0]?.center ?? [];
    if (!Number.isFinite(lat) || metresBetween(lat, lng, place.lat, place.lng) > ADDRESS_MATCH_METRES) return coordsLink(place);
    return link;
  } catch {
    // Offline or the lookup failed: the name and address search is still the best guess.
    return link;
  }
}
