const scrapeReel = require('./_lib/scrape-reel');
const scrapeLocation = require('./scrape-location');
const { canonicalInstagramUrl, instagramSlide } = require('./_lib/reel-url');
const { readCache, writeCache } = require('./_lib/lookup-cache');
const { launchBrowser, closeBrowser } = require('./_lib/browser');
const { captionVenue, captionPlaceForSlide } = require('./_lib/caption');
const { captionMentions, isGuide, handleToPlace, captionSuburb } = require('./_lib/handles');
const { captionCity, saysWhere, withArea } = require('./_lib/area');

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
// cleanUrl is the link that is read; cacheKey also names the slide for carousel links.
async function readReel(reelUrl, cleanUrl, cacheKey, slide, getBrowser) {
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
  const reelResponse = await invoke(scrapeReel, { reelUrl: cleanUrl || reelUrl }, getBrowser);
  if (reelResponse.statusCode >= 400 || !reelResponse.body?.success) {
    return { status: reelResponse.statusCode, body: reelResponse.body || { error: 'Could not read Instagram Reel' } };
  }
  const reel = { ...reelResponse.body, reelUrl };
  // No caption and no creator: Instagram showed a login wall or an empty page, not the post.
  if (!reel.caption && !reel.creator && !reel.placeName && !reel.location) {
    return { status: 200, body: { error: 'Instagram showed an empty page for this post' } };
  }
  // A list post names one place per slide: use the shared slide's place, not the whole list.
  const listed = captionPlaceForSlide(reel.caption, slide);
  if (listed) {
    return { reel: { ...reel, placeName: listed.name, location: listed.address }, venue: listed.line, listed: true, candidates: null, fromCache: false };
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

// The quick read only names the main poster. The page also names a collab's other posters and the
// post's location tag. Read once per lookup, and only after a quick read (Chrome reads have these already).
async function readPageExtras(reel, cleanUrl, getBrowser) {
  if (reel.source !== 'oembed' || reel.pageRead || !cleanUrl) return reel;
  const page = await invoke(scrapeReel, { reelUrl: cleanUrl, forceBrowser: true }, getBrowser);
  if (page.statusCode >= 400 || !page.body?.success) return { ...reel, pageRead: true };
  return { ...reel, pageRead: true, collaborators: page.body.collaborators || [], locationTag: page.body.locationTag || '' };
}

// Handle lookups stop after this many Maps searches, or once this much of the lookup's time is used,
// so the caption search and the details read still fit in the function's 120 seconds.
const HANDLE_SEARCHES = 4;
const HANDLE_BUDGET_MS = 55000;

// Steps 4–6 of finding the place, for captions with no "Name:" line, list or 📍 line:
//   4. @mentions in the caption (not the poster), guides like @melbfoodie last
//   5. a collab's other posters (only the page shows them, so the page is read first)
//   6. the poster, unless it's a reviewer's handle
// Each handle is searched on Maps as "name suburb", where the suburb comes from the post's location
// tag, the handle ("sweetag.glenwaverley") or the caption ("in Glen Waverley"). A search only counts
// when a result is named like the handle, so a reviewer's handle never matches some random place.
// Returns { reel, venue, query, candidates } on a hit, else { reel, guess } for the place picker.
async function findByHandles(reel, cleanUrl, getBrowser, startedAt) {
  const tried = new Set();
  let current = reel;
  let searches = 0;
  let guess = null;
  const poster = String(reel.creator || '').toLowerCase();

  const attempt = async (handle) => {
    if (!handle || tried.has(handle)) return null;
    if (searches >= HANDLE_SEARCHES || Date.now() - startedAt > HANDLE_BUDGET_MS) return null;
    tried.add(handle);
    const { name, suburb } = handleToPlace(handle);
    if (squash(name).length < 3) return null;
    const where = current.locationTag || suburb || captionSuburb(current.caption) || captionCity(current.caption);
    guess ??= { name, location: where };
    searches += 1;
    const query = [name, where].filter(Boolean).join(' ');
    const response = await invoke(scrapeLocation, { action: 'search', query, placeName: name, location: where }, getBrowser);
    const found = response.statusCode < 400 && response.body?.success ? response.body.candidates || [] : [];
    const key = squash(name);
    const named = found.filter((candidate) => hasWholeWords(candidate.name, key) || squash(candidate.name).includes(key));
    if (!named.length) return null;
    return {
      reel: { ...current, placeName: name, location: where },
      venue: query,
      query,
      candidates: named,
    };
  };

  const mentions = captionMentions(current.caption).filter((handle) => handle !== poster);
  for (const handle of [...mentions.filter((h) => !isGuide(h)), ...mentions.filter(isGuide)]) {
    const hit = await attempt(handle);
    if (hit) return hit;
  }

  // Collab posters are only on the page.
  if (Date.now() - startedAt < HANDLE_BUDGET_MS) current = await readPageExtras(current, cleanUrl, getBrowser);

  const coPosters = (current.collaborators || []).map((h) => String(h).toLowerCase()).filter((h) => h !== poster);
  for (const handle of coPosters) {
    const hit = await attempt(handle);
    if (hit) return hit;
  }

  // A reviewer posting ("kel.eats", "melbfoodie") is never the venue, so only a shop's own handle is tried.
  const hit = isGuide(poster) ? null : await attempt(poster);
  if (hit) return hit;
  return { reel: current, guess };
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
  const startedAt = Date.now();
  const backgroundOnly = Boolean(req.backgroundOnly || req.body?.background === true);
  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  // Only Instagram lookups are cached: one link spelling per Reel, and every save goes through it.
  const cleanUrl = canonicalInstagramUrl(reelUrl);
  // Each photo of a carousel can be a different place, so the slide is part of the cache key.
  const bodySlide = Number(req.body?.slide);
  const slide = instagramSlide(reelUrl) ?? (Number.isInteger(bodySlide) && bodySlide >= 1 && bodySlide <= 20 ? bodySlide : null);
  const cacheKey = cleanUrl && slide ? `${cleanUrl}?img_index=${slide}` : cleanUrl;
  const read = await readReel(reelUrl, cleanUrl, cacheKey, slide, getBrowser);
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

  let { reel, venue } = read;
  // No "Name:" line, list or 📍 line: look for the place by the handles in and on the post.
  let handleHit = null;
  let guess = null;
  if (!read.fromCache && !venue && !reel.placeName && !reel.location) {
    const found = await findByHandles(reel, cleanUrl, getBrowser, startedAt);
    if (found.candidates) {
      handleHit = found;
      ({ reel, venue } = found);
    } else {
      ({ reel, guess } = found);
    }
  }
  // Where the post is: its location tag, else the city its caption names most. It's added to the search,
  // so Google doesn't answer a vague search with places near the server (in the US). The page is only
  // opened for the tag when the caption names no city.
  let area = '';
  if (!read.fromCache && !handleHit) {
    area = reel.locationTag || captionCity(reel.caption);
    if (!area) {
      reel = await readPageExtras(reel, cleanUrl, getBrowser);
      area = reel.locationTag || '';
    }
  }
  const placeName = String(reel.placeName || '').replace(/^@/, '');
  // Captions usually end with the venue, so the flipped caption leads with it. The venue is added
  // again in front of it, and Maps returns a list of matches for the query. From the cache there is
  // no caption, so the query is the venue on its own.
  const flipped = flipCaption(reel.caption);
  // A listed place is searched on its own: the rest of the caption names the other places.
  // The area goes right after the venue, or in front of a caption that doesn't say where.
  const captionQuery = area && flipped && !saysWhere(flipped, area) ? `${area} ${flipped}` : flipped;
  const query = handleHit?.query ||
    (venue ? `📍${withArea(venue, area)} ${read.listed ? '' : flipped}`.trim() : captionQuery) ||
    withArea([reel.location, placeName].filter(Boolean).join(', '), area) || reel.creator || '';
  // Only what the lookup needs is kept: the venue it found and Google's results. Not the caption.
  const saveReel = (candidates) => writeCache('reel_lookups', cacheKey, {
    place: { placeName: reel.placeName || '', location: reel.location || '', venue: venue || '' },
    candidates,
  });
  // Nothing found: the place picker opens with the best guess from the handles filled in.
  const withGuess = (body) => (guess ? { ...body, placeName: body.placeName || guess.name, location: body.location || guess.location } : body);
  if (!query) {
    // An empty result isn't cached: it would stop every later try for 100 days.
    return res.status(200).json(withGuess({ ...reel, venue, maps: { success: false, error: 'No place/location text was found in the Reel.' } }));
  }

  let candidates;
  if (read.candidates) {
    ({ candidates } = read);
  } else if (handleHit) {
    ({ candidates } = handleHit);
    await saveReel(candidates);
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
      // A guess isn't saved: the handles are tried again next time.
      if (!read.fromCache && !guess) await saveReel(null);
      return res.status(200).json(withGuess({
        ...reel,
        venue,
        maps: { success: false, query, error: searchResponse.body?.error || 'Google Maps search failed', candidates: [] },
      }));
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
