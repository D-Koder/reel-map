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
  const locationLine = reel.caption.split(/\r?\n/).find((line) => /^\s*[📍📌]/u.test(line))?.trim();
  const searchCaption = locationLine
    ? `${locationLine}\n${reel.caption.replace(/^\s*[📍📌].*(?:\r?\n|$)/mu, '').trim()}`
    : reel.caption;
  const query = searchCaption || [reel.location, placeName].filter(Boolean).join(', ') || reel.creator || '';
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
  if (!selectedCandidate && typeof req.selectCandidate !== 'function' && candidates.length === 1) {
    selectedCandidate = candidates[0];
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