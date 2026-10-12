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

// Lower-case letters and digits only, so "Yo Art" and "YoArt" compare equal.
const squash = (text) => String(text ?? '')
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');

// Whole words of a name, squashed: "Yo Art Frozen (The Glen)" → ["yo", "art", "frozen", "the", "glen"].
const words = (text) => String(text ?? '').split(/[^\p{L}\p{N}]+/u).map(squash).filter(Boolean);

// True when some run of whole words in the name spells the key: "Yo Art Frozen" has "yo"+"art" = "yoart",
// but "Yoarthi" and "Theyo ar type" don't (they only contain the letters inside other words).
function hasWholeWords(name, key) {
  const list = words(name);
  for (let start = 0; start < list.length; start += 1) {
    let joined = '';
    for (let end = start; end < list.length && joined.length < key.length; end += 1) {
      joined += list[end];
      if (joined === key) return true;
    }
  }
  return false;
}

// The Google Maps result to pick without asking, or null when it isn't clear.
// One result → that one. Otherwise each hint (best first) is tried in two rounds:
//   1. whole words: "YoArt" → "Yo Art Frozen Yoghurt (The Glen)", not "Yoarthi" or "Theyo ar type";
//   2. letters anywhere in the name, when no name has the whole words.
// A round only picks when exactly one result matches; a tie asks the user.
// Same rule as bestCandidate in api/enrich-reel.js.
export function bestPlaceMatch(candidates, hints = []) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];
  for (const hint of hints) {
    const key = squash(hint);
    if (key.length < 4) continue;
    const whole = candidates.filter((candidate) => hasWholeWords(candidate.name, key));
    if (whole.length === 1) return whole[0];
    if (whole.length > 1) continue;
    const partial = candidates.filter((candidate) => squash(candidate.name).includes(key));
    if (partial.length === 1) return partial[0];
  }
  return null;
}

// The venue written after a pin in a caption. 📍 wins over 📌, because captions also use 📌 for
// headings like "📌 Details:". Same rule as captionVenue in api/_lib/caption.js.
export function captionVenue(caption) {
  const found = [...String(caption || '').matchAll(/([📍📌])\s*([^\n#()🏷]+)/gu)]
    .map(([, pin, text]) => ({
      pin,
      text: text.trim().replace(/^(?:location|address|where|venue|spot)\s*:\s*/i, '').trim(),
    }))
    .filter(({ text }) => text && !text.endsWith(':'));
  return (found.find(({ pin }) => pin === '📍') ?? found[0])?.text ?? '';
}

// Name hints from a reel lookup, best first: the tagged place, the 📍 venue, then the first part of the location.
export function reelPlaceHints(reel) {
  return [
    String(reel?.placeName ?? '').replace(/^@/, ''),
    captionVenue(reel?.caption).split(',')[0].trim(),
    reel?.location?.split(',')[0],
  ].filter(Boolean);
}
