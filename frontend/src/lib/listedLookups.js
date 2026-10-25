import { readJSON, writeJSON } from './storage';
import { bestPlaceMatch, namedLike } from './places';
import { requestListedPlace } from './googlePlaces';

// Each listed place's Google Maps lookup for a list post: { candidates, best, details }, with details null
// until the place is tapped. Kept on this device by reel and the place's line in the post, so closing
// the add sheet or the app doesn't look it up again. Started when the reel is shared, so Finish opens
// with them ready. Kept 7 days.
const KEY = 'reelmap:listed-lookups';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// How many of a post's places are looked up ahead, two at a time.
export const LISTED_AHEAD = 8;

// Name hints for a listed place: its name, the same name in the other Chinese script (人和館 → 人和馆),
// and its local name when it was written in English (Zhapu Road Bridge → 乍浦路桥).
export const listedHints = (item) => [item.name, item.otherName, item.localName].filter(Boolean);

// Lookups running now, by reel and line, so the inbox and the add sheet share one.
const running = new Map();
const runKey = (reelUrl, line) => `${reelUrl}\n${line}`;

// { [reelUrl]: { savedAt, places: { [line]: lookup } } }, with reels older than 7 days dropped.
function readStore() {
  const store = readJSON(KEY, {});
  const now = Date.now();
  return Object.fromEntries(Object.entries(store).filter(([, reel]) => now - (reel?.savedAt ?? 0) < MAX_AGE_MS));
}

function saveLookup(reelUrl, line, lookup) {
  const store = readStore();
  const reel = store[reelUrl] ?? { places: {} };
  store[reelUrl] = { savedAt: Date.now(), places: { ...reel.places, [line]: lookup } };
  writeJSON(KEY, store);
}

// A lookup kept from before, or null.
export function savedListedLookup(reelUrl, line) {
  return readStore()[reelUrl]?.places?.[line] ?? null;
}

// The place picked by hand for a listed place becomes its match, here and on this device.
export function saveListedPick(reelUrl, line, lookup) {
  running.set(runKey(reelUrl, line), Promise.resolve(lookup));
  saveLookup(reelUrl, line, { ...lookup, picked: true });
}

// A single Google result is only taken as the match when it's named like the place, or written in a
// script none of the names are in, so it can't be compared (Duo Yun Bookstore → 朵云书院). Google's
// only answer for "Zhapu Road Bridge" was the road, Zha Pu Lu: that one is picked by hand.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
function soleMatch(candidate, hints) {
  const comparable = hints.some((hint) => CJK.test(hint) === CJK.test(candidate.name));
  return !comparable || namedLike(candidate, hints) ? candidate : null;
}

// The reel's places are all saved: its lookups aren't needed any more.
export function forgetListedLookups(reelUrl) {
  [...running.keys()].filter((key) => key.startsWith(`${reelUrl}\n`)).forEach((key) => running.delete(key));
  const store = readStore();
  delete store[reelUrl];
  writeJSON(KEY, store);
}

// One listed place's lookup: kept, running, or asked now. log(message, type) hears how a new one went.
// The reel lookup already searched the first place, so its results are used as they are.
// fresh: Google is searched again, skipping what this device and the server saved ("Search again").
export function lookupListedPlace(reelUrl, item, reelData, log = () => {}, fresh = false) {
  const key = runKey(reelUrl, item.line);
  const known = fresh ? null : running.get(key);
  if (known) return known;
  // A lookup kept from before the place had its local name (乍浦路桥) is done again, unless picked by hand.
  const saved = fresh ? null : savedListedLookup(reelUrl, item.line);
  if (saved && (saved.picked || (saved.localName || '') === (item.localName || ''))) {
    const lookup = Promise.resolve(saved);
    running.set(key, lookup);
    return lookup;
  }
  // The reel lookup's own place: same name and, when the list gives one, same address. A second branch
  // with the same name (Nana's Green Tea on Swanston St after Bourke St) is looked up on its own.
  const plain = (text) => String(text || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const sameSpot = !item.address || plain(reelData?.location).includes(plain(item.address));
  const first = !fresh && item.name === reelData?.placeName && sameSpot && reelData?.maps?.candidates?.length ? reelData.maps : null;
  const lookup = (async () => {
    const data = first || await requestListedPlace({
      reelUrl, name: item.name, address: item.address || '', area: item.area || reelData?.area || '', ...(fresh ? { fresh } : {}),
    });
    const candidates = (data.candidates || []).map((candidate) => ({ ...candidate, searchQuery: data.query }));
    // A show held at a venue is listed by the show's name, with the venue in its address line.
    const hints = [...listedHints(item), item.address].filter(Boolean);
    const best = candidates.length === 1 ? soleMatch(candidates[0], hints)
      : bestPlaceMatch(candidates, hints, [], item.address);
    log(`${item.name}: ${best ? `matched ${best.name}` : `${candidates.length} Google Maps result${candidates.length === 1 ? '' : 's'}, none clear`}${
      first ? ' (from the reel lookup)' : data.saved ? ' (saved lookup)' : ''}`, best ? 'success' : 'info');
    // Only the search runs ahead. The match's details (hours, phone, menu) are read when the place is
    // tapped or saved with "Add all", so places that are skipped never wait on them.
    const result = { candidates, best, details: null, ...(item.localName ? { localName: item.localName } : {}) };
    saveLookup(reelUrl, item.line, result);
    return result;
  })();
  running.set(key, lookup);
  // A failed lookup is forgotten, so the next ask tries again.
  lookup.catch(() => running.get(key) === lookup && running.delete(key));
  return lookup;
}

// A shared list post: look its places up in the background, two at a time.
export function prefetchListedPlaces(reelUrl, reelData) {
  const list = reelData?.listedPlaces;
  if (!reelUrl || !(list?.length > 1)) return;
  const queue = list.slice(0, LISTED_AHEAD);
  const work = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      await lookupListedPlace(reelUrl, item, reelData).catch(() => {});
    }
  };
  work();
  work();
}
