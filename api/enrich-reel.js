const scrapeReel = require('./scrape-reel');
const scrapeLocation = require('./scrape-location');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const reelUrl = typeof req.body?.reelUrl === 'string' ? req.body.reelUrl.trim() : '';
  const reelResponse = await invoke(scrapeReel, { reelUrl });
  if (reelResponse.statusCode >= 400 || !reelResponse.body?.success) {
    return res.status(reelResponse.statusCode).json(reelResponse.body || { error: 'Could not read Instagram Reel' });
  }

  const reel = reelResponse.body;
  const placeName = String(reel.placeName || '').replace(/^@/, '');
  // Captions usually end with the venue, so the flipped caption leads with it. The venue is added
  // again in front of it, and Maps returns a list of matches for the query.
  const venue = reel.caption.match(/[📍📌]\s*([^\n#()🏷]+)/u)?.[1].trim();
  const flipped = flipCaption(reel.caption);
  const query = (venue ? `📍${venue} ${flipped}` : flipped) || [reel.location, placeName].filter(Boolean).join(', ') || reel.creator || '';
  if (!query) {
    return res.status(200).json({ ...reel, maps: { success: false, error: 'No place/location text was found in the Reel.' } });
  }

  const searchResponse = await invoke(scrapeLocation, {
    action: 'search',
    query,
    placeName: reel.placeName,
    location: reel.location,
    caption: reel.caption,
  });
  if (searchResponse.statusCode >= 400 || !searchResponse.body?.success) {
    return res.status(200).json({
      ...reel,
      maps: { success: false, query, error: searchResponse.body?.error || 'Google Maps search failed', candidates: [] },
    });
  }

  const candidates = searchResponse.body.candidates || [];
  const requestedName = typeof req.body?.placeName === 'string' ? req.body.placeName : reel.placeName;
  let selectedCandidate = null;
  if (typeof req.selectCandidate === 'function') {
    const choice = await req.selectCandidate(candidates);
    selectedCandidate = candidates.find((candidate) => candidate.url === choice?.url) || null;
  } else if (req.body?.mapsPlaceUrl) {
    selectedCandidate = candidates.find((candidate) => candidate.url === req.body.mapsPlaceUrl) || null;
  } else if (requestedName) {
    selectedCandidate = candidates.find((candidate) => normalize(candidate.name) === normalize(requestedName)) || null;
  }
  if (!selectedCandidate && typeof req.selectCandidate !== 'function') {
    selectedCandidate = candidates.length === 1
      ? candidates[0]
      : bestCandidate(candidates, [placeName, venue, String(reel.location || '').split(',')[0]]);
  }

  let details = null;
  let detailsError = null;
  if (selectedCandidate) {
    const detailsResponse = await invoke(scrapeLocation, {
      action: 'details',
      query,
      placeUrl: selectedCandidate.url,
      placeAddress: selectedCandidate.address,
      placeName: selectedCandidate.name,
      location: selectedCandidate.address || reel.location,
    });
    if (detailsResponse.statusCode >= 400) detailsError = detailsResponse.body?.error || 'Could not read Google Maps details';
    else details = detailsResponse.body;
  }

  return res.status(200).json({
    ...reel,
    maps: { success: true, query, candidates, selectedCandidate, details, detailsError },
  });
};