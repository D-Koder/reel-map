import { placeIdFromMapsUrl } from './placePhoto';

// Two saved places are at the same spot when their coordinates match to about a metre.
const SAME_SPOT_DEGREES = 0.00001;

// Ids of places in one collection that are saved more than once there: the same reel twice, or two
// places at the same spot. Events don't count, since one venue hosts different events on different nights.
export function duplicateIds(pins) {
  const ids = new Set();
  const others = pins.filter((p) => p.category !== 'event');
  others.forEach((a, i) => {
    others.slice(i + 1).forEach((b) => {
      // One reel can list several places (a top-5 post), so the same reel only counts with the same name.
      const sameReel = a.reel_url && a.reel_url === b.reel_url && squash(a.name) === squash(b.name);
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
  // A saved "…/maps/place/?q=place_id:ID" link opens the Google Maps app as a search for the text "place_id:ID",
  // so the place is opened the documented way: a search for its name and address, with its id.
  const placeId = placeIdFromMapsUrl(place.maps_url ?? '');
  if (placeId) {
    const text = [place.venue_name ?? place.name, place.address].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  if (/^https:\/\/www\.google\.[a-z.]+\/maps\/place\//.test(place.maps_url ?? '')) return place.maps_url;
  if (!place.address) return hasCoords(place) ? coordsLink(place) : null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.venue_name ?? place.name}, ${place.address}`)}`;
}

// Same link, but falls back to the saved pin when the address is somewhere else (or can't be found),
// so Google doesn't open the wrong spot.
export async function checkedGoogleMapsLink(place, signal) {
  const link = googleMapsLink(place);
  // A link with the place's own Google id is already exact.
  if (link === place.maps_url || placeIdFromMapsUrl(place.maps_url ?? '') || !place.address || !hasCoords(place) || !MAPBOX_TOKEN) return link;
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

// Lower-case letters and digits only, so "Yo Art" and "YoArt" compare equal. Same as in api/_lib/names.js.
const squash = (text) => String(text ?? '')
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');

// How long a squashed name is for the "too short to match by chance" rules. A Chinese, Japanese or
// Korean character says as much as two letters, so a three-character name like 人和馆 counts.
// Same as in api/_lib/names.js.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
function letters(key) {
  let count = 0;
  for (const char of key) count += CJK.test(char) ? 2 : 1;
  return count;
}

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
//   3. a result's whole name written inside the hint ("the restaurant is called Frenchie"), or at the
//      start of a one-word handle ("sneakerlaundrylabau" → "Sneaker Laundry LAB").
// A round only picks when exactly one result matches. A tie between branches of one chain is broken
// by the suburb ("ING Korean BBQ, Glen Waverley" → the Glen Waverley branch, not Vermont South);
// any other tie asks the user. Before all that, when `address` is a street address and exactly one
// result is at it, that one is picked: a new or renamed shop is often still on Google under the old name.
// Same rule as bestCandidate in api/enrich-reel.js.
export function bestPlaceMatch(candidates, hints = [], areas = [], address = '') {
  if (!candidates?.length) return null;
  // A town or suburb (Google's answer to a vague search) is never picked by itself.
  if (candidates.length === 1) return isArea(candidates[0]) ? null : candidates[0];
  candidates = candidates.filter((candidate) => !isArea(candidate));
  return atStreetAddress(candidates, address) || matchByName(candidates, hints) || matchByArea(candidates, hints, areas);
}

// A town, suburb or region rather than a business: Google lists it with no address and no rating, under
// "Melbourne, Victoria, Australia" or its own name. Same as in api/enrich-reel.js.
function isArea(candidate) {
  if (candidate.address || candidate.rating) return false;
  const kind = String(candidate.category || '');
  const plain = (value) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return kind.includes(',') || plain(kind) === plain(candidate.name) || !kind;
}

// True when the result is named like one of the hints (the name rules of bestPlaceMatch).
export function namedLike(candidate, hints = []) {
  return Boolean(matchByName([candidate], hints));
}

// The street number(s) and street of an address: "Shop 2/209-211 Russell St, Melbourne" →
// { from: 209, to: 211, street: 'russell' }. Null when no part has a number then a street name.
// A short first word ("St Kilda Rd", "Mt Alexander Rd") takes the next word too.
// Same as in api/enrich-reel.js.
function streetAddress(text) {
  for (const part of String(text || '').split(',')) {
    const found = part.replace(/^.*\//, '').match(/(\d+)[a-z]?(?:\s*[-–]\s*(\d+)[a-z]?)?\s+([\p{L}][\p{L}'.]*)(?:\s+([\p{L}][\p{L}'.]*))?/iu);
    if (!found) continue;
    const from = Number(found[1]);
    const to = Math.max(from, Number(found[2] || found[1]));
    const street = squash(found[3]).length <= 3 && found[4] ? squash(found[3] + found[4]) : squash(found[3]);
    return { from, to, street };
  }
  return null;
}

// The one result at the street address (numbers overlap, same street). When several overlap, the one
// with exactly the same number(s) ("164" → 164, not 163-165). Else null.
export function atStreetAddress(candidates, address) {
  const wanted = streetAddress(address);
  if (!wanted) return null;
  const at = (candidates || []).filter((candidate) => {
    const spot = streetAddress(candidate.address);
    return spot && spot.street === wanted.street && spot.from <= wanted.to && wanted.from <= spot.to;
  });
  if (at.length === 1) return at[0];
  const exact = at.filter((candidate) => {
    const spot = streetAddress(candidate.address);
    return spot.from === wanted.from && spot.to === wanted.to;
  });
  return exact.length === 1 ? exact[0] : null;
}

function matchByName(candidates, hints) {
  for (const hint of hints) {
    const key = squash(hint);
    if (letters(key) < 4) continue;
    const whole = candidates.filter((candidate) => hasWholeWords(candidate.name, key));
    if (whole.length === 1) return whole[0];
    if (whole.length > 1) continue;
    const partial = candidates.filter((candidate) => squash(candidate.name).includes(key));
    if (partial.length === 1) return partial[0];
    // 3. the other way round: a result's whole name written inside the hint, e.g. "the restaurant
    //    is called Frenchie" → "Frenchie" (names under 4 letters are too likely to appear by chance).
    const inside = candidates.filter((candidate) => nameInsideHint(candidate.name, hint));
    if (inside.length === 1) return inside[0];
  }
  return null;
}

// Branches named like the place (whole words), narrowed to the one whose name or address has the suburb.
function matchByArea(candidates, hints, areas) {
  const hint = hints.map(squash).find((key) => letters(key) >= 4 &&
    candidates.filter((candidate) => hasWholeWords(candidate.name, key)).length > 1);
  if (!hint) return null;
  const branches = candidates.filter((candidate) => hasWholeWords(candidate.name, hint));
  for (const area of areas) {
    const key = squash(area);
    if (letters(key) < 4) continue;
    const inArea = branches.filter((candidate) => hasWholeWords(`${candidate.name} ${candidate.address || ''}`, key));
    if (inArea.length === 1) return inArea[0];
  }
  return null;
}

// The suburb parts of the reel's location: "ING Korean BBQ, Glen Waverley" → ["Glen Waverley"].
export function reelPlaceAreas(reel) {
  return [...String(reel?.location ?? '').split(',').slice(1), reel?.area ?? '']
    .map((part) => part.trim()).filter(Boolean);
}

// A result's whole name written inside the hint: as whole words ("the restaurant is called Frenchie"),
// or at the start of a one-word handle with a suffix ("sneakerlaundrylabau" → "Sneaker Laundry LAB").
// Names under 4 letters (6 for the handle case) are too likely to appear by chance.
function nameInsideHint(name, hint) {
  const key = squash(name);
  if (letters(key) < 4) return false;
  if (hasWholeWords(hint, key)) return true;
  return letters(key) >= 6 && words(hint).length === 1 && squash(hint).startsWith(key);
}

// The results named like the place, so a search that also returns unrelated places nearby ("Sole Wash"
// for "Sneaker Laundry LAB") only offers the ones that fit. Each hint (best first) is tried; the first
// that matches any result decides. When nothing matches, every result is kept. A result written in
// another script than a Chinese, Japanese or Korean hint ("Yuxing Ji" for 裕興記) can't be compared, so
// it's kept too.
export function relatedPlaces(candidates, hints = []) {
  if (!candidates?.length) return [];
  for (const hint of hints) {
    const key = squash(hint);
    if (letters(key) < 4) continue;
    const related = candidates.filter((candidate) => hasWholeWords(candidate.name, key) ||
      squash(candidate.name).includes(key) || nameInsideHint(candidate.name, hint));
    if (related.length) return candidates.filter((candidate) => related.includes(candidate) || (CJK.test(hint) && !CJK.test(candidate.name)));
  }
  return candidates;
}

// Name hints from a reel lookup, best first: the place the AI read, the same name in the other Chinese script
// (人和館 → 人和馆), then the first part of the location.
export function reelPlaceHints(reel) {
  return [
    String(reel?.placeName ?? '').replace(/^@/, ''),
    reel?.otherName,
    reel?.localName,
    reel?.location?.split(',')[0],
  ].filter(Boolean);
}
