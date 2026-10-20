import { readJSON, writeJSON } from './storage';
import { bestPlaceMatch } from './places';
import { requestListedPlace, requestLocationApi } from './googlePlaces';

// Each listed place's Google Maps lookup for a list post: { candidates, best, details }. Kept on this
// device by reel and the place's line in the post, so closing the add sheet or the app doesn't look
// it up again. Started when the reel is shared, so Finish opens with them ready. Kept 7 days.
const KEY = 'reelmap:listed-lookups';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// How many of a post's places are looked up ahead, two at a time.
export const LISTED_AHEAD = 8;

// Name hints for a listed place: its name, then the same name in the other Chinese script (人和館 → 人和馆).
export const listedHints = (item) => [item.name, item.otherName].filter(Boolean);

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
  saveLookup(reelUrl, line, lookup);
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
export function lookupListedPlace(reelUrl, item, reelData, log = () => {}) {
  const key = runKey(reelUrl, item.line);
  const known = running.get(key);
  if (known) return known;
  const saved = savedListedLookup(reelUrl, item.line);
  if (saved) {
    const lookup = Promise.resolve(saved);
    running.set(key, lookup);
    return lookup;
  }
  const first = item.name === reelData?.placeName && reelData?.maps?.candidates?.length ? reelData.maps : null;
  const lookup = (async () => {
    const data = first || await requestListedPlace({
      reelUrl, name: item.name, address: item.address || '', area: reelData?.area || '',
    });
    const candidates = (data.candidates || []).map((candidate) => ({ ...candidate, searchQuery: data.query }));
    // A single Google result is taken as the match.
    const best = bestPlaceMatch(candidates, listedHints(item), [], item.address)
      || (candidates.length === 1 ? candidates[0] : null);
    log(`${item.name}: ${best ? `matched ${best.name}` : `${candidates.length} Google Maps result${candidates.length === 1 ? '' : 's'}, none clear`}${
      first ? ' (from the reel lookup)' : data.saved ? ' (saved lookup)' : ''}`, best ? 'success' : 'info');
    const details = best ? await requestLocationApi({
      action: 'details',
      query: best.searchQuery,
      placeUrl: best.url,
      placeAddress: best.address,
      placeName: best.name,
      location: best.address || item.address || reelData?.area || '',
    }).catch(() => null) : null;
    const result = { candidates, best, details };
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
