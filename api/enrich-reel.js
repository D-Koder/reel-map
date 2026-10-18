const scrapeReel = require('./_lib/scrape-reel');
const scrapeLocation = require('./scrape-location');
const { canonicalInstagramUrl, instagramSlide } = require('./_lib/reel-url');
const { readCache, writeCache, insertDebugRow } = require('./_lib/lookup-cache');
const { captureConsole, capturedLines } = require('./_lib/console-capture');
const { launchBrowser, closeBrowser } = require('./_lib/browser');
const { requestCountry, requestTimeZone, dayIn } = require('./_lib/country');
const { captionMentions, handleToPlace } = require('./_lib/handles');
const { aiPlace } = require('./_lib/ai-place');

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

// True when the text already names the area, so it isn't added twice.
// Hashtags don't count: Google reads "#sydneyfood" as one word, not as Sydney.
function saysWhere(text, area) {
  const value = String(text || '').replace(/#[\p{L}\p{N}_]+/gu, ' ').toLocaleLowerCase();
  return Boolean(area) && value.includes(String(area).toLocaleLowerCase());
}

// "Salted egg burger" + "Melbourne" → "Salted egg burger Melbourne", so a vague search isn't answered
// with places near the server (in the US). Left alone when it already says where.
function withArea(text, area) {
  const value = String(text || '').trim();
  if (!area || !value || saysWhere(value, area)) return value;
  return `${value} ${area}`;
}

// What the AI found, as the reel fields the rest of the lookup uses. A list post shared without a
// slide offers every place to pick from.
// The AI gives a handle's business name in words; a name still written as a handle is split at its dots.
function applyAi(reel, ai) {
  const pick = ai.kind === 'list' ? ai.places[ai.slidePlace ?? 0] : ai.places[0];
  const fromHandle = ['creator', 'mention'].includes(pick.source) && /^@?[\w.]+$/.test(pick.name);
  const name = fromHandle ? handleToPlace(pick.name).name : pick.name;
  const where = pick.area || ai.postArea || '';
  const choices = ai.kind === 'list' && ai.places.length > 1 && ai.slidePlace === null
    ? { listedPlaces: ai.places.map(({ name: listed, address, category, evidence }) => ({ name: listed, address, category, line: evidence })) }
    : {};
  // A pop-up or stall has no shop to find: only its street is searched, for the pin. Searching its
  // name would find the brand's permanent shops instead.
  const popup = ai.temporary
    ? { name, startDate: ai.startDate, endDate: ai.endDate, dateEvidence: ai.dateEvidence }
    : null;
  return {
    // Cafe, food, event or other. A pop-up is always an event.
    reel: { ...reel, placeName: name, location: pick.address || where, placeSource: pick.source,
      category: ai.temporary ? 'event' : pick.category, ...choices },
    venue: popup ? pick.address || where : [name, pick.address || where].filter(Boolean).join(', '),
    area: ai.postArea || pick.area,
    lowConfidence: ai.confidence === 'low',
    popup,
  };
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
// ("YoArt" → "Yo Art Frozen Yoghurt"), else a single name containing the letters. A tie between
// branches of one chain is broken by the suburb; any other tie asks the user.
// Same rule as bestPlaceMatch in frontend/src/lib/places.js.
// When the post gives a street address and exactly one result is at it, that one wins first: the
// address is what the author wrote, and a new or renamed shop is often still listed on Google under the
// old name ("taking over the former Pounding Rice Bowl spot" → Pounding Rice Bowl, 209-211 Russell St).
function bestCandidate(candidates, hints, areas = [], address = '') {
  return atStreetAddress(candidates, address) || matchByName(candidates, hints) || matchByArea(candidates, hints, areas);
}

// A town, suburb or region rather than a business: Google lists it with no address and no rating, under
// "Melbourne, Victoria, Australia" or its own name ("Melbourne" for a caption search of "…in Melbourne").
function isArea(candidate) {
  if (candidate.address || candidate.rating) return false;
  const kind = String(candidate.category || '');
  return kind.includes(',') || normalize(kind) === normalize(candidate.name) || !kind;
}

// The street number(s) and street of an address: "Shop 2/209-211 Russell St, Melbourne" →
// { from: 209, to: 211, street: 'russell' }. Null when no part has a number then a street name.
// A short first word ("St Kilda Rd", "Mt Alexander Rd") takes the next word too.
// Same as in frontend/src/lib/places.js.
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

// The one result at the post's street address (numbers overlap, same street). When several overlap, the one
// with exactly the same number(s) ("164" → 164, not 163-165). Else null.
function atStreetAddress(candidates, address) {
  const wanted = streetAddress(address);
  if (!wanted) return null;
  const at = candidates.filter((candidate) => {
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

// Branches named like the place (whole words), narrowed to the one whose name or address has the suburb.
function matchByArea(candidates, hints, areas) {
  const hint = hints.map(squash).find((key) => key.length >= 4 &&
    candidates.filter((candidate) => hasWholeWords(candidate.name, key)).length > 1);
  if (!hint) return null;
  const branches = candidates.filter((candidate) => hasWholeWords(candidate.name, hint));
  for (const area of areas) {
    const key = squash(area);
    if (key.length < 4) continue;
    const inArea = branches.filter((candidate) => hasWholeWords(`${candidate.name} ${candidate.address || ''}`, key));
    if (inArea.length === 1) return inArea[0];
  }
  return null;
}

function matchByName(candidates, hints) {
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
    const inside = candidates.filter((candidate) => nameInsideHint(candidate.name, hint));
    if (inside.length === 1) return inside[0];
  }
  return null;
}

// A result's whole name written inside the hint: as whole words, or at the start of a one-word
// handle with a suffix ("sneakerlaundrylabau" → "Sneaker Laundry LAB"). Same as in places.js.
function nameInsideHint(name, hint) {
  const key = squash(name);
  if (key.length < 4) return false;
  if (hasWholeWords(hint, key)) return true;
  const hintWords = String(hint || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return key.length >= 6 && hintWords.length === 1 && squash(hint).startsWith(key);
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// What a reel lookup needs, from the shared cache when anyone has looked the reel up before.
// The cache keeps only the venue it found ({ placeName, location, venue }) and the one Google result the
// app picked by itself: never the caption, hashtags or creator. Rows with several results or none (saved
// by older code, before a person chose) are ignored, so the next person sees the choices again.
// Returns { reel, venue, candidates, fromCache } on success, or { status, body } with the scraper's error.
// cleanUrl is the link that is read; cacheKey also names the slide for carousel links.
async function readReel(reelUrl, cleanUrl, cacheKey, slide, getBrowser) {
  const cached = await readCache('reel_lookups', cacheKey, REEL_CACHE_DAYS);
  const cachedPlace = cached?.data?.place;
  // A row with no place name (saved by older code from a search of the caption) is a guess: ignored.
  if (cachedPlace?.placeName && cached.data.candidates?.length === 1) {
    const { placeName = '', location = '', venue = '', category, choices } = cachedPlace;
    const reel = {
      success: true, reelUrl, caption: '', creator: null, likes: null, comments: null,
      placeName, location, date: '', hashtags: [], videoUrl: '', thumbnailUrl: '', source: 'cache',
      ...(category ? { category } : {}),
      ...(choices?.length ? { listedPlaces: choices } : {}),
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
  // The AI reads the caption for the venue, so nothing is taken from it here.
  return { reel, venue: '', candidates: null, fromCache: false };
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

// The quick read only names the main poster. The page also names a collab's other posters, the people
// tagged in the post and its location tag. Read once per lookup, and only after a quick read (Chrome
// reads have these already).
async function readPageExtras(reel, cleanUrl, getBrowser) {
  if (reel.source !== 'oembed' || reel.pageRead || !cleanUrl) return reel;
  const page = await invoke(scrapeReel, { reelUrl: cleanUrl, forceBrowser: true }, getBrowser);
  if (page.statusCode >= 400 || !page.body?.success) return { ...reel, pageRead: true };
  return {
    ...reel, pageRead: true, collaborators: page.body.collaborators || [], tagged: page.body.tagged || [],
    locationTag: page.body.locationTag || '', date: reel.date || page.body.date || '',
  };
}

// Handle lookups stop after this many Maps searches, or once this much of the lookup's time is used,
// so the caption search and the details read still fit in the function's 120 seconds.
const HANDLE_SEARCHES = 4;
const HANDLE_BUDGET_MS = 55000;

// When the AI found no place (or couldn't run), the handles on the post are tried:
//   4. @mentions in the caption (not the poster)
//   5. a collab's other posters, then the people tagged in the post (only the page shows them, so
//      the page is read first)
//   6. the poster
// Each handle is searched on Maps as its words plus the post's location tag. A search only counts
// when a result is named like the handle, so a reviewer's handle never matches some random place.
// "Named like" is either way round: the handle's words inside the result's name, or the result's
// whole name at the start of the handle ("dancebakesmelbourne" → "Dance Bakes").
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
    const { name } = handleToPlace(handle);
    if (squash(name).length < 3) return null;
    const where = current.locationTag || '';
    guess ??= { name, location: where };
    searches += 1;
    const query = [name, where].filter(Boolean).join(' ');
    const response = await invoke(scrapeLocation, { action: 'search', query, placeName: name, location: where }, getBrowser);
    const found = response.statusCode < 400 && response.body?.success ? response.body.candidates || [] : [];
    const key = squash(name);
    const named = found.filter((candidate) => hasWholeWords(candidate.name, key) || squash(candidate.name).includes(key) ||
      (squash(candidate.name).length >= 6 && key.startsWith(squash(candidate.name))));
    if (!named.length) return null;
    return {
      reel: { ...current, placeName: name, location: where },
      venue: query,
      query,
      candidates: named,
    };
  };

  const mentions = captionMentions(current.caption).filter((handle) => handle !== poster);
  for (const handle of mentions) {
    const hit = await attempt(handle);
    if (hit) return hit;
  }

  // Collab posters are only on the page.
  if (Date.now() - startedAt < HANDLE_BUDGET_MS) current = await readPageExtras(current, cleanUrl, getBrowser);

  const coPosters = [...(current.collaborators || []), ...(current.tagged || [])]
    .map((h) => String(h).toLowerCase()).filter((h) => h !== poster);
  for (const handle of coPosters) {
    const hit = await attempt(handle);
    if (hit) return hit;
  }

  const hit = await attempt(poster);
  if (hit) return hit;
  return { reel: current, guess };
}

// One Chrome for every step of this lookup (reel, Maps search, Maps details), started only when a
// step needs it. Starting Chrome takes a second or two each time, so this saves up to two starts.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let launching = null;
  // A Chrome that failed to start isn't kept, so the next step (e.g. the retry search) starts it again.
  const getBrowser = () => (launching ??= launchBrowser().catch((error) => { launching = null; throw error; }));
  try {
    // The reel inbox ({ from: 'inbox' }) shows "We couldn't tell which place this is" when no place
    // was matched. Those lookups are kept in lookup_debug before the answer goes back.
    if (req.body?.from !== 'inbox') return await enrich(req, res, getBrowser);
    const reply = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    // The server's console lines for this lookup are kept, so the row shows everything it ran.
    return await captureConsole(async () => {
      await enrich(req, reply, getBrowser);
      if (reply.code === 200 && reply.body?.success !== false && !reply.body?.maps?.details?.name) {
        await logNoPlace(req.body.reelUrl, reply.body);
      }
      return res.status(reply.code).json(reply.body);
    });
  } finally {
    if (launching) await closeBrowser(await launching.catch(() => null));
  }
};

// Why no place was picked, in words, for lookup_debug.
function noPlaceReason(body) {
  const maps = body.maps || {};
  if (body.unreadable) return "Couldn't read the post";
  // The server's own error ("spawn ETXTBSY") says why, where the message for the app doesn't.
  if (!maps.success) {
    const detail = body.steps?.mapsPage?.error;
    return [maps.error || 'Google Maps search failed', detail && `(${detail})`].filter(Boolean).join(' ');
  }
  const count = maps.candidates?.length ?? 0;
  if (!count) return 'Google Maps found nothing';
  if (!maps.selectedCandidate) return `${count} results, none named like the place`;
  return maps.detailsError || "Couldn't read the chosen place's details";
}

async function logNoPlace(reelUrl, body) {
  const maps = body?.maps || {};
  await insertDebugRow({
    reel_url: String(reelUrl || body?.reelUrl || '').slice(0, 2048),
    from_cache: body?.source === 'cache',
    caption: body?.caption || null,
    creator: body?.creator || null,
    location_tag: body?.locationTag || null,
    place_name: body?.placeName || null,
    location: body?.location || null,
    venue: body?.venue || null,
    query: maps.query || null,
    candidates: (maps.candidates || []).map(({ name, address, category, url }) => ({ name, address, category, url })),
    reason: noPlaceReason(body || {}),
    logs: lookupLogs(body || {}, capturedLines()),
  });
}

// The lookup's log as the app shows it (same lines as applyReelData in AddPlaceSheet.jsx), then every
// server console line, as one text.
function lookupLogs(body, consoleLines) {
  const time = `[${new Date().toISOString().slice(11, 19)}]`;
  const lines = [];
  const add = (text) => lines.push(`${time} ${text}`);
  const { steps, maps, popup } = body;
  if (steps) {
    add(`Read from: ${steps.source}`);
    if (body.tagged?.length) add(`Tagged accounts: ${body.tagged.map((handle) => `@${handle}`).join(', ')}`);
    add(`AI: ${steps.ai}`);
    if (steps.category) add(`Category: ${steps.category}`);
    if (steps.handles) add(`Handles: ${steps.handles}`);
    if (steps.area) add(`Area added to search: ${steps.area}`);
    add(`Google Maps search: ${steps.mapsSearch}${steps.mapsUrl ? ` ${steps.mapsUrl}` : ''}`);
    if (steps.mapsPage) {
      const page = steps.mapsPage;
      add(page.error ? `Google Maps error: ${page.error}`
        : `Google showed: "${page.title}" ${page.url} · ${String(page.text || '').replace(/\s+/g, ' ').slice(0, 200)}`);
    }
    if (steps.saved) add(`Saved for other people: ${steps.saved}`);
  }
  if (popup) {
    const days = !popup.endDate ? 'no clear dates in the post'
      : popup.startDate === popup.endDate ? `on ${popup.endDate}` : `on ${popup.startDate} to ${popup.endDate}`;
    add(`Pop-up: ${popup.name}, ${days}.`);
    if (popup.ended) add(`⚠️ This pop-up ended on ${popup.endDate}.`);
  }
  add(`Location: ${body.location || 'Not found'}`);
  add(`Likes: ${body.likes || 0}`);
  if (maps?.details?.name) {
    add(`Google Maps matched ${maps.details.name}.`);
    if (maps.details.googleName) add(`Matched by the post's address; Google lists it as ${maps.details.googleName}.`);
    add(`Address: ${maps.details.address || 'Not listed'}`);
  } else if (maps?.candidates?.length) {
    add(`Searched with: "${maps.query}"`);
    add(`Found ${maps.candidates.length} Google Maps match${maps.candidates.length === 1 ? '' : 'es'}, none picked: ${
      maps.candidates.map((candidate) => candidate.name).join(', ')}`);
  } else if (maps?.error) {
    add(`Google Maps: ${maps.error}`);
  }
  return [lines.join('\n'), consoleLines.length && `Server console:\n${consoleLines.join('\n')}`]
    .filter(Boolean).join('\n\n');
}

// /api/save-reel also asks for this while the app is closed ({ background: true }). It picks the place
// the same way: a clear match is saved to TBD, anything else waits for the person to pick.
async function enrich(req, res, getBrowser) {
  const startedAt = Date.now();
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
  const country = requestCountry(req);
  const timeZone = requestTimeZone(req);
  // The AI reads every post that has a caption (with its location tag and collab posters from the
  // page, which it weighs too): the venue, the area, whether it's a pop-up and the kind of place.
  let aiFound = null;
  let aiOrderOnly = false;
  // What the lookup did, for the Add place log: what the AI found and what Google Maps was asked.
  const steps = {
    source: read.fromCache ? 'saved lookup' : 'Instagram',
    ai: read.fromCache ? 'skipped (saved lookup)' : reel.caption ? 'called' : 'skipped (no caption)',
  };
  if (!read.fromCache && reel.caption) {
    reel = await readPageExtras(reel, cleanUrl, getBrowser);
    const ai = await aiPlace({
      caption: reel.caption, locationTag: reel.locationTag, creator: reel.creator,
      collaborators: reel.collaborators, tagged: reel.tagged, slide, userCountry: country,
      postDay: reel.date ? dayIn(timeZone, reel.date) : '',
    });
    steps.ai = `called: ${!ai ? 'no answer' : ai.kind === 'order_only' ? 'order/pickup post, no place'
      : ai.places.length ? `found ${ai.places.map((place) => `${place.name}${place.handle ? ` (from @${place.handle})` : ''} — quote: "${place.evidence}"`).join('; ')} (confidence: ${ai.confidence})${
        ai.temporary ? `; pop-up${ai.endDate ? ` on ${ai.startDate === ai.endDate ? ai.endDate : `${ai.startDate} to ${ai.endDate}`} — quote: "${ai.dateEvidence}"` : ', no clear dates'}` : ''}`
        : 'found no place'}`;
    if (ai?.kind === 'order_only') {
      aiOrderOnly = true;
    } else if (ai?.places.length) {
      aiFound = applyAi(reel, ai);
      ({ reel, venue } = aiFound);
    }
    // With no place, the post's own kind is the category (a pop-up is always an event).
    if (ai && !reel.category) reel = { ...reel, category: ai.postCategory };
  }
  steps.category = reel.category
    ? `${reel.category} (${read.fromCache ? 'saved lookup' : 'AI'})`
    : 'none, so Food (AI not used)';

  // The AI found no place (or couldn't run): look for the place by the handles in and on the post.
  let handleHit = null;
  let guess = null;
  if (!read.fromCache && !aiFound && !aiOrderOnly) {
    const found = await findByHandles(reel, cleanUrl, getBrowser, startedAt);
    steps.handles = found.candidates ? `found by handle: ${found.query}` : 'tried handles, none matched';
    if (found.candidates) {
      handleHit = found;
      ({ reel, venue } = found);
    } else {
      ({ reel, guess } = found);
    }
  }
  // Where the post is: the area the AI read from the caption, else the post's location tag, else the
  // person's own country. It's added to the search, so Google doesn't answer a vague search with
  // places near the server (in the US). The page is only opened for the tag when nothing else says where.
  let area = '';
  if (!read.fromCache && !handleHit) {
    area = aiFound?.area || reel.locationTag;
    if (!area) {
      reel = await readPageExtras(reel, cleanUrl, getBrowser);
      area = reel.locationTag || '';
    }
    area ||= country;
  }
  const placeName = String(reel.placeName || '').replace(/^@/, '');
  // The AI's venue is searched on its own with the area: the rest of the caption only adds noise.
  // With no venue at all, the whole caption is the last resort: captions usually end with the venue,
  // so the flipped caption leads with it. An order/pickup post (the AI says so) is not searched:
  // no place is better than the collection point.
  const orderOnly = aiOrderOnly;
  const flipped = orderOnly ? '' : flipCaption(reel.caption);
  // The area goes right after the venue, or in front of a caption that doesn't say where.
  const captionQuery = area && flipped && !saysWhere(flipped, area) ? `${area} ${flipped}` : flipped;
  const query = handleHit?.query ||
    (venue ? `📍${withArea(venue, area)}` : captionQuery) ||
    withArea([reel.location, placeName].filter(Boolean).join(', '), area) || (orderOnly ? '' : reel.creator) || '';
  // Only what the lookup needs is kept: the venue it found and the place picked. Not the caption.
  const saveReel = (candidates) => writeCache('reel_lookups', cacheKey, {
    place: {
      placeName: reel.placeName || '', location: reel.location || '', venue: venue || '',
      ...(reel.category ? { category: reel.category } : {}),
      ...(reel.listedPlaces?.length ? { choices: reel.listedPlaces } : {}),
    },
    candidates,
  });
  steps.area = area || '';
  steps.mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
  steps.mapsSearch = read.candidates ? 'skipped (results from saved lookup)' : handleHit ? 'done while trying handles' : query ? 'searched' : 'nothing to search';
  // Nothing found: the place picker opens with the best guess from the handles filled in.
  // A pop-up's name and days, with whether it's already over (by the person's own date).
  const popupInfo = () => (aiFound?.popup
    ? { ...aiFound.popup, ended: Boolean(aiFound.popup.endDate) && aiFound.popup.endDate < dayIn(timeZone) }
    : null);
  const withGuess = (body) => {
    const popup = popupInfo();
    return {
      ...(guess ? { ...body, placeName: body.placeName || guess.name, location: body.location || guess.location } : body),
      steps, ...(popup ? { popup } : {}),
    };
  };
  if (!query) {
    // An empty result isn't cached: it would stop every later try for 100 days.
    return res.status(200).json(withGuess({ ...reel, venue, maps: { success: false, error: 'No place/location text was found in the Reel.' } }));
  }

  let candidates;
  if (read.candidates) {
    ({ candidates } = read);
  } else if (handleHit) {
    ({ candidates } = handleHit);
  } else {
    const searchResponse = await invoke(scrapeLocation, {
      action: 'search',
      query,
      placeName: reel.placeName,
      location: reel.location,
      caption: reel.caption,
    }, getBrowser);
    if (searchResponse.statusCode >= 400 || !searchResponse.body?.success) {
      // Nothing is saved, so the next lookup tries again from the start.
      // What Google's page showed the server (a consent screen, a block, an empty list…).
      steps.mapsPage = searchResponse.body?.page || (searchResponse.body?.details ? { error: searchResponse.body.details } : null);
      return res.status(200).json(withGuess({
        ...reel,
        venue,
        maps: { success: false, query, error: searchResponse.body?.error || 'Google Maps search failed', candidates: [] },
      }));
    }
    candidates = searchResponse.body.candidates || [];
  }

  const popup = popupInfo();
  const typedName = typeof req.body?.placeName === 'string';
  const requestedName = typedName ? req.body.placeName : reel.placeName;
  // A list post shared without a slide: no telling which place was meant, so nothing is picked
  // unless the person chose a result. Nor when the AI said it was unsure of the place.
  const mustPick = reel.listedPlaces?.length > 1 || Boolean(aiFound?.lowConfidence);
  const nameHints = [String(reel.placeName || '').replace(/^@/, ''), venue, String(reel.location || '').split(',')[0]];
  let selectedCandidate = null;
  // True only when the app picked the place by itself, not from a person's choice or typed name.
  let autoPicked = false;
  if (mustPick && !req.body?.mapsPlaceUrl && typeof req.selectCandidate !== 'function') {
    selectedCandidate = null;
  } else if (typeof req.selectCandidate === 'function') {
    const choice = await req.selectCandidate(candidates);
    selectedCandidate = candidates.find((candidate) => candidate.url === choice?.url) || null;
  } else if (req.body?.mapsPlaceUrl) {
    selectedCandidate = candidates.find((candidate) => candidate.url === req.body.mapsPlaceUrl) || null;
  } else if (requestedName) {
    selectedCandidate = candidates.find((candidate) => normalize(candidate.name) === normalize(requestedName)) || null;
    autoPicked = !typedName;
  }
  if (!selectedCandidate && !mustPick && typeof req.selectCandidate !== 'function') {
    // A pop-up's search is its address, so no result is named like it: only a single result, or the one
    // result at its street address (a pop-up in a shop: the shop's pin, the pop-up's name), is used.
    // A town or suburb (Google's answer to a vague search) is never picked by itself.
    const places = candidates.filter((candidate) => !isArea(candidate));
    selectedCandidate = candidates.length === 1
      ? places[0] || null
      : popup ? atStreetAddress(places, reel.location) : bestCandidate(places, nameHints,
        [...String(reel.location || '').split(',').slice(1), ...String(venue || '').split(',').slice(1), area || ''], reel.location);
    autoPicked = true;
  }

  const detailsRead = selectedCandidate
    ? await readDetails(selectedCandidate, query, reel, getBrowser)
    : { details: null, detailsError: null };
  const { detailsError } = detailsRead;
  let { details } = detailsRead;
  // Picked by the post's address under another name (the old shop, before Google caught up): the pin
  // and details are Google's, the name is the post's. googleName keeps what Google calls it.
  const byAddress = autoPicked && selectedCandidate && details && !popup && reel.placeName &&
    atStreetAddress([selectedCandidate], reel.location) && !matchByName([selectedCandidate], nameHints);
  if (byAddress) {
    details = { ...details, name: reel.placeName, googleName: details.name };
    steps.pickedBy = `the post's address (${reel.location}); Google lists it as ${details.googleName}`;
  }

  // Saved for everyone only when the app picked one place by itself and read it without an error.
  // A choice, a typed name, no match or an error isn't saved, so the next person sees the options again.
  // Nor is a pop-up: it's only on for a few days, and the pick is its street, not the pop-up.
  // Nor when nothing named the place (a search of the caption): that pick is a guess.
  const save = !read.fromCache && autoPicked && selectedCandidate && details && !detailsError && !popup && Boolean(reel.placeName);
  if (save) await saveReel([selectedCandidate]);
  steps.saved = read.fromCache ? 'already saved' : save ? 'yes (the app picked the place by itself)'
    : popup ? 'no (pop-ups are only on for a few days)'
      : selectedCandidate && !reel.placeName ? 'no (nothing named the place, so the pick is a guess)'
      : 'no (not picked by the app by itself, so the next person sees the options)';

  return res.status(200).json({
    ...reel,
    venue,
    area,
    steps,
    ...(popup ? { popup } : {}),
    maps: { success: true, query, candidates, selectedCandidate, details, detailsError },
  });
}
