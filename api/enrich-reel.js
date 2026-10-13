const scrapeReel = require('./_lib/scrape-reel');
const scrapeLocation = require('./scrape-location');
const { canonicalInstagramUrl } = require('./_lib/reel-url');
const { readCache, writeCache } = require('./_lib/lookup-cache');
const { launchBrowser, closeBrowser } = require('./_lib/browser');
const { captionVenue } = require('./_lib/caption');

// How long saved lookups are reused. Kept long while there are few users; opening hours and phone
// numbers can change, so lower PLACE_CACHE_DAYS as the app grows.
const REEL_CACHE_DAYS = 100;
const PLACE_CACHE_DAYS = 100;

async function invoke(handler, body, getBrowser) {
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
  await handler({ method: 'POST', body, getBrowser }, response);
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
    // 3. the other way round: a result's whole name written inside the hint, e.g. "the restaurant
    //    is called Frenchie" → "Frenchie" (names under 4 letters are too likely to appear by chance).
    const inside = candidates.filter((candidate) => squash(candidate.name).length >= 4 && hasWholeWords(hint, squash(candidate.name)));
    if (inside.length === 1) return inside[0];
  }
  return null;
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// What a reel lookup needs, from the shared cache when anyone has looked the reel up before.
// The cache keeps only the venue it found ({ placeName, location, venue }) and Google's results for it:
// never the caption, hashtags or creator. Older rows in another shape are ignored.
// Returns { reel, venue, candidates, fromCache } on success, or { status, body } with the scraper's error.
async function readReel(reelUrl, cacheKey, getBrowser) {
  const cached = await readCache('reel_lookups', cacheKey, REEL_CACHE_DAYS);
  const cachedPlace = cached?.data?.place;
  // A saved lookup that found nothing is skipped, so the reel is read again.
  const foundSomething = cachedPlace && (cachedPlace.placeName || cachedPlace.location || cachedPlace.venue || cached.data.candidates?.length);
  if (foundSomething) {
    const { placeName = '', location = '', venue = '' } = cachedPlace;
    const reel = {
      success: true, reelUrl, caption: '', creator: null, likes: null, comments: null,
      placeName, location, date: '', hashtags: [], videoUrl: '', thumbnailUrl: '', source: 'cache',
    };
    return { reel, venue, candidates: cached.data.candidates ?? null, fromCache: true };
  }

  // The clean link is read, without extras like "?img_index=3&igsh=…" that can make Instagram say no.
  const reelResponse = await invoke(scrapeReel, { reelUrl: cacheKey || reelUrl }, getBrowser);
  if (reelResponse.statusCode >= 400 || !reelResponse.body?.success) {
    return { status: reelResponse.statusCode, body: reelResponse.body || { error: 'Could not read Instagram Reel' } };
  }
  const reel = { ...reelResponse.body, reelUrl };
  // No caption and no creator: Instagram showed a login wall or an empty page, not the post.
  if (!reel.caption && !reel.creator && !reel.placeName && !reel.location) {
    return { status: 200, body: { error: 'Instagram showed an empty page for this post' } };
  }
  return { reel, venue: captionVenue(reel.caption), candidates: null, fromCache: false };
}

// Google Maps details for one result, shared by everyone who saves that place.
async function readDetails(candidate, query, reel, getBrowser) {
  const cached = await readCache('place_lookups', candidate.url, PLACE_CACHE_DAYS);
  if (cached?.data) return { details: cached.data, detailsError: null };

  const detailsResponse = await invoke(scrapeLocation, {
    action: 'details',
    query,
    placeUrl: candidate.url,
    placeAddress: candidate.address,
    placeName: candidate.name,
    location: candidate.address || reel.location,
  }, getBrowser);
  if (detailsResponse.statusCode >= 400) {
    return { details: null, detailsError: detailsResponse.body?.error || 'Could not read Google Maps details' };
  }
  await writeCache('place_lookups', candidate.url, detailsResponse.body);
  return { details: detailsResponse.body, detailsError: null };
}

// One Chrome for every step of this lookup (reel, Maps search, Maps details), started only when a
// step needs it. Starting Chrome takes a second or two each time, so this saves up to two starts.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let launching = null;
  const getBrowser = () => (launching ??= launchBrowser());
  try {
    return await enrich(req, res, getBrowser);
  } finally {
    if (launching) await closeBrowser(await launching.catch(() => null));
  }
};

// { background: true } is sent by /api/save-reel, which asks for this while the app is closed. Nobody
// can pick a place then, so Maps details are only read when the search found exactly one place.
// (It can only narrow what a lookup does, so anyone sending it is harmless.)
async function enrich(req, res, getBrowser) {
  const backgroundOnly = Boolean(req.backgroundOnly || req.body?.background === true);
  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  // Only Instagram lookups are cached: one link spelling per Reel, and every save goes through it.
  const cacheKey = canonicalInstagramUrl(reelUrl);
  const read = await readReel(reelUrl, cacheKey, getBrowser);
  // Not a reel link: say so. Otherwise, when the reel couldn't be read (oEmbed and Chrome both failed),
  // carry on without its details, so the person picks the place instead of seeing an error.
  if (!read.reel && read.status === 400) return res.status(400).json(read.body);
  // Nothing is cached for an unreadable reel, so the next try reads it again.
  if (!read.reel) {
    console.warn('Reel could not be read; the person will pick the place:', read.body?.error);
    return res.status(200).json({
      success: true, reelUrl, caption: '', creator: null, likes: null, comments: null, placeName: '', location: '',
      date: '', hashtags: [], videoUrl: '', thumbnailUrl: '', venue: '', unreadable: true,
      maps: { success: false, error: "Couldn't read this reel, so pick the place yourself.", candidates: [] },
    });
  }

  const { reel, venue } = read;
  const placeName = String(reel.placeName || '').replace(/^@/, '');
  // Captions usually end with the venue, so the flipped caption leads with it. The venue is added
  // again in front of it, and Maps returns a list of matches for the query. From the cache there is
  // no caption, so the query is the venue on its own.
  const flipped = flipCaption(reel.caption);
  const query = (venue ? `📍${venue} ${flipped}`.trim() : flipped) || [reel.location, placeName].filter(Boolean).join(', ') || reel.creator || '';
  // Only what the lookup needs is kept: the venue it found and Google's results. Not the caption.
  const saveReel = (candidates) => writeCache('reel_lookups', cacheKey, {
    place: { placeName: reel.placeName || '', location: reel.location || '', venue: venue || '' },
    candidates,
  });
  if (!query) {
    // An empty result isn't cached: it would stop every later try for 100 days.
    return res.status(200).json({ ...reel, venue, maps: { success: false, error: 'No place/location text was found in the Reel.' } });
  }

  let candidates;
  if (read.candidates) {
    ({ candidates } = read);
  } else {
    const searchResponse = await invoke(scrapeLocation, {
      action: 'search',
      query,
      placeName: reel.placeName,
      location: reel.location,
      caption: reel.caption,
    }, getBrowser);
    if (searchResponse.statusCode >= 400 || !searchResponse.body?.success) {
      // The Reel is still worth keeping: the next lookup only needs to retry the search.
      if (!read.fromCache) await saveReel(null);
      return res.status(200).json({
        ...reel,
        venue,
        maps: { success: false, query, error: searchResponse.body?.error || 'Google Maps search failed', candidates: [] },
      });
    }
    candidates = searchResponse.body.candidates || [];
    await saveReel(candidates);
  }

  const requestedName = typeof req.body?.placeName === 'string' ? req.body.placeName : reel.placeName;
  let selectedCandidate = null;
  if (backgroundOnly) {
    selectedCandidate = candidates.length === 1 ? candidates[0] : null;
  } else if (typeof req.selectCandidate === 'function') {
    const choice = await req.selectCandidate(candidates);
    selectedCandidate = candidates.find((candidate) => candidate.url === choice?.url) || null;
  } else if (req.body?.mapsPlaceUrl) {
    selectedCandidate = candidates.find((candidate) => candidate.url === req.body.mapsPlaceUrl) || null;
  } else if (requestedName) {
    selectedCandidate = candidates.find((candidate) => normalize(candidate.name) === normalize(requestedName)) || null;
  }
  if (!selectedCandidate && !backgroundOnly && typeof req.selectCandidate !== 'function') {
    selectedCandidate = candidates.length === 1
      ? candidates[0]
      : bestCandidate(candidates, [placeName, venue, String(reel.location || '').split(',')[0]]);
  }

  const { details, detailsError } = selectedCandidate
    ? await readDetails(selectedCandidate, query, reel, getBrowser)
    : { details: null, detailsError: null };

  return res.status(200).json({
    ...reel,
    venue,
    maps: { success: true, query, candidates, selectedCandidate, details, detailsError },
  });
}
