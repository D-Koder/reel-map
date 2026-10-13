// Two saved places are at the same spot when their coordinates match to about a metre.
const SAME_SPOT_DEGREES = 0.00001;

// Ids of places in one collection that are saved more than once there: the same reel twice, or two
// places at the same spot. Events don't count, since one venue hosts different events on different nights.
export function duplicateIds(pins) {
  const ids = new Set();
  const others = pins.filter((p) => p.category !== 'event');
  others.forEach((a, i) => {
    others.slice(i + 1).forEach((b) => {
      const sameReel = a.reel_url && a.reel_url === b.reel_url;
      const sameSpot = Number.isFinite(a.lat) && Number.isFinite(a.lng) && Number.isFinite(b.lat) && Number.isFinite(b.lng) &&
        Math.abs(a.lat - b.lat) < SAME_SPOT_DEGREES && Math.abs(a.lng - b.lng) < SAME_SPOT_DEGREES;
      if (sameReel || sameSpot) {
        ids.add(a.id);
        ids.add(b.id);
      }
    });
  });
  return ids;
}

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
//   2. letters anywhere in the name, when no name has the whole words;
//   3. a result's whole name written inside the hint ("the restaurant is called Frenchie").
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
    // 3. the other way round: a result's whole name written inside the hint, e.g. "the restaurant
    //    is called Frenchie" → "Frenchie" (names under 4 letters are too likely to appear by chance).
    const inside = candidates.filter((candidate) => squash(candidate.name).length >= 4 && hasWholeWords(hint, squash(candidate.name)));
    if (inside.length === 1) return inside[0];
  }
  return null;
}

// How much a pinned line looks like a place rather than a date or a promo. Higher is more place-like.
// "📍 Smolbitez, Flinders St" scores well; "📍 Flinders Shop: 17–18 Oct" and "📍 Pop-up: 3 days only" don't.
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DATE_OR_TIME = new RegExp([
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:[–-]\\s*\\d{1,2}(?:st|nd|rd|th)?\\s*)?${MONTH}\\b`, // 17–18 Oct, 3rd Nov
  `\\b${MONTH}\\s+\\d{1,2}\\b`, // Oct 17
  '\\b\\d{1,2}\\/\\d{1,2}\\b', // 28/10
  '\\b\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\b', // 5pm, 5:30pm
  '\\b(?:till|until|til)\\s+late\\b', // till late
].join('|'), 'i');
const PROMO = /\b(?:only|until|till|promo|launch|sale|limited|pop-?up|days?|weeks?)\b/i;
const STREET = /\b(?:st|street|rd|road|lane|ln|ave|avenue|pl|place|arcade|parade|pde|hwy|highway|blvd|boulevard|dr|drive|cres|crescent|tce|terrace|square|sq|mall|centre|center|plaza)\b/i;
const STATE = /\b(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b|\b(?!19|20)\d{4}\b/;
function placeScore(text) {
  let score = 0;
  if (STREET.test(text)) score += 2;
  if (STATE.test(text)) score += 2;
  if (/\b\d+[a-z]?(?:\/\d+[a-z]?)?\s+[A-Z]/.test(text)) score += 1; // 61 Little Collins, 146/148 Little Bourke
  if (/^[^,]{2,40},\s*\S/.test(text)) score += 1; // Name, suburb
  if (/@[\w.]+/.test(text)) score += 1;
  if (DATE_OR_TIME.test(text)) score -= 3;
  if (PROMO.test(text)) score -= 2;
  return score;
}

// The venue written after a pin in a caption. 📍 wins over 📌, because captions also use 📌 for
// headings like "📌 Details:". Same rule as captionVenue in api/_lib/caption.js.
export function captionVenue(caption) {
  const found = [...String(caption || '').matchAll(/([📍📌])\s*([^\n#()🏷📍📌]+)/gu)]
    .map(([, pin, text]) => ({
      pin,
      text: text.trim().replace(/^(?:location|address|where|venue|spot)\s*:\s*/i, '')
        // A pin mid-sentence ("my new quest to 📍Frenchie. all I can say…") ends at the sentence's end.
        .split(/[.!?](?:\s|$)/)[0].trim(),
    }))
    .filter(({ text }) => text && !text.endsWith(':'));
  // Lines that look like a place (score above 0) beat dates and promos; among them the first 📍, then
  // the first 📌. With none, the highest score. A lone pin is always used.
  const scored = found.map((entry) => ({ ...entry, score: placeScore(entry.text) }));
  const places = scored.filter(({ score }) => score > 0);
  const best = places.find(({ pin }) => pin === '📍') ?? places[0] ??
    [...scored].sort((a, b) => b.score - a.score || (a.pin === '📍' ? 0 : 1) - (b.pin === '📍' ? 0 : 1))[0];
  return best?.text ?? '';
}

// Name hints from a reel lookup, best first: the tagged place, the 📍 venue, then the first part of the location.
export function reelPlaceHints(reel) {
  return [
    String(reel?.placeName ?? '').replace(/^@/, ''),
    captionVenue(reel?.caption).split(',')[0].trim(),
    reel?.location?.split(',')[0],
  ].filter(Boolean);
}
