const scrapeReel = require('./scrape-reel');
const scrapeLocation = require('./scrape-location');
const { canonicalInstagramUrl } = require('./_lib/reel-url');
const { fetchInstagramOembed } = require('./_lib/instagram-oembed');
const { readCache, writeCache, DAY } = require('./_lib/lookup-cache');

// How long saved lookups are reused. Captions don't change; opening hours and phone numbers can.
const REEL_CACHE_DAYS = 30;
const PLACE_CACHE_DAYS = 14;
// Instagram cover links expire after a few days, so a cached cover older than this is asked for again.
const COVER_MAX_AGE = DAY;

async function invoke(handler, body) {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  await handler({ method: 'POST', body }, response);
  return response;
}

// Swap the two word halves of a caption, so the end of the caption comes first.
function flipCaption(caption) {
  const words = String(caption || '').split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  return [...words.slice(half), ...words.slice(0, half)].join(' ');
}

// Lower-case letters and digits only, so "Yo Art" and "YoArt" compare equal.
function squash(value) {
  return String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

// True when some run of whole words in the name spells the key: "Yo Art Frozen" spells "yoart",
// but "Yoarthi" and "Theyo ar type" only contain the letters inside other words.
function hasWholeWords(name, key) {
  const list = String(name || '').split(/[^\p{L}\p{N}]+/u).map(squash).filter(Boolean);
  for (let start = 0; start < list.length; start += 1) {
    let joined = '';
    for (let end = start; end < list.length && joined.length < key.length; end += 1) {
      joined += list[end];
      if (joined === key) return true;
    }
  }
  return false;
}

// The result to pick without asking, trying the best hint first: a single whole-word match
// ("YoArt" → "Yo Art Frozen Yoghurt"), else a single name containing the letters. A tie asks the user.
// Same rule as bestPlaceMatch in frontend/src/lib/places.js.
function bestCandidate(candidates, hints) {
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

function normalize(value) {
  return String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// The Reel's caption, creator and cover, from the shared cache when anyone has looked it up before.
// Returns { reel } on success, or { status, body } with the scraper's error.
async function readReel(reelUrl, cacheKey) {
  const cached = await readCache('reel_lookups', cacheKey, REEL_CACHE_DAYS);
  if (cached?.data?.reel) {
    const reel = { ...cached.data.reel, reelUrl };
    if (cached.ageMs > COVER_MAX_AGE) {
      const oembed = await fetchInstagramOembed(reelUrl, 5000).catch(() => null);
      if (oembed?.ok && oembed.thumbnailUrl) reel.thumbnailUrl = oembed.thumbnailUrl;
    }
    return { reel, search: cached.data.search ?? null, fromCache: true };
  }

  const reelResponse = await invoke(scrapeReel, { reelUrl });
  if (reelResponse.statusCode >= 400 || !reelResponse.body?.success) {
    return { status: reelResponse.statusCode, body: reelResponse.body || { error: 'Could not read Instagram Reel' } };
  }
  return { reel: reelResponse.body, search: null, fromCache: false };
}

// Google Maps details for one result, shared by everyone who saves that place.
async function readDetails(candidate, query, reel) {
  const cached = await readCache('place_lookups', candidate.url, PLACE_CACHE_DAYS);
  if (cached?.data) return { details: cached.data, detailsError: null };

  const detailsResponse = await invoke(scrapeLocation, {
    action: 'details',
    query,
    placeUrl: candidate.url,
    placeAddress: candidate.address,
    placeName: candidate.name,
    location: candidate.address || reel.location,
  });
  if (detailsResponse.statusCode >= 400) {
    return { details: null, detailsError: detailsResponse.body?.error || 'Could not read Google Maps details' };
  }
  await writeCache('place_lookups', candidate.url, detailsResponse.body);
  return { details: detailsResponse.body, detailsError: null };
}

// req.backgroundOnly is set by /api/save-reel, which runs this while the app is closed. Nobody can
// pick a place then, so Maps details are only read when the search found exactly one place.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  // Only Instagram lookups are cached: one link spelling per Reel, and every save goes through it.
  const cacheKey = canonicalInstagramUrl(reelUrl);
  const read = await readReel(reelUrl, cacheKey);
  if (!read.reel) return res.status(read.status).json(read.body);

  const { reel } = read;
  const placeName = String(reel.placeName || '').replace(/^@/, '');
  // Captions usually end with the venue, so the flipped caption leads with it. The venue is added
  // again in front of it, and Maps returns a list of matches for the query.
  const venue = reel.caption.match(/[📍📌]\s*([^\n#()🏷]+)/u)?.[1].trim();
  const flipped = flipCaption(reel.caption);
  const query = (venue ? `📍${venue} ${flipped}` : flipped) || [reel.location, placeName].filter(Boolean).join(', ') || reel.creator || '';
  const saveReel = (search) => writeCache('reel_lookups', cacheKey, { reel: { ...reel, reelUrl: cacheKey }, search });
  if (!query) {
    if (!read.fromCache) await saveReel(null);
    return res.status(200).json({ ...reel, maps: { success: false, error: 'No place/location text was found in the Reel.' } });
  }

  let candidates;
  if (read.search?.query === query) {
    candidates = read.search.candidates;
  } else {
    const searchResponse = await invoke(scrapeLocation, {
      action: 'search',
      query,
      placeName: reel.placeName,
      location: reel.location,
      caption: reel.caption,
    });
    if (searchResponse.statusCode >= 400 || !searchResponse.body?.success) {
      // The Reel is still worth keeping: the next lookup only needs to retry the search.
      if (!read.fromCache) await saveReel(null);
      return res.status(200).json({
        ...reel,
        maps: { success: false, query, error: searchResponse.body?.error || 'Google Maps search failed', candidates: [] },
      });
    }
    candidates = searchResponse.body.candidates || [];
    await saveReel({ query, candidates });
  }

  const requestedName = typeof req.body?.placeName === 'string' ? req.body.placeName : reel.placeName;
  let selectedCandidate = null;
  if (req.backgroundOnly) {
    selectedCandidate = candidates.length === 1 ? candidates[0] : null;
  } else if (typeof req.selectCandidate === 'function') {
    const choice = await req.selectCandidate(candidates);
    selectedCandidate = candidates.find((candidate) => candidate.url === choice?.url) || null;
  } else if (req.body?.mapsPlaceUrl) {
    selectedCandidate = candidates.find((candidate) => candidate.url === req.body.mapsPlaceUrl) || null;
  } else if (requestedName) {
    selectedCandidate = candidates.find((candidate) => normalize(candidate.name) === normalize(requestedName)) || null;
  }
  if (!selectedCandidate && !req.backgroundOnly && typeof req.selectCandidate !== 'function') {
    selectedCandidate = candidates.length === 1
      ? candidates[0]
      : bestCandidate(candidates, [placeName, venue, String(reel.location || '').split(',')[0]]);
  }

  const { details, detailsError } = selectedCandidate
    ? await readDetails(selectedCandidate, query, reel)
    : { details: null, detailsError: null };

  return res.status(200).json({
    ...reel,
    maps: { success: true, query, candidates, selectedCandidate, details, detailsError },
  });
};
