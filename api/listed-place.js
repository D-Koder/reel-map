const { requireUser } = require('./_lib/auth');
const scrapeLocation = require('./scrape-location');
const { reelLookupKey } = require('./_lib/reel-url');
const { readCache, writeCache } = require('./_lib/lookup-cache');
const { squash } = require('./_lib/names');

// Same as in enrich-reel.js.
const REEL_CACHE_DAYS = 100;

const text = (value) => (typeof value === 'string' ? value.trim().slice(0, 500) : '');

// One place of a list post shared without a slide ("4 must-try spots"): its Google Maps results.
// The app asks for every listed place as soon as the list shows, so tapping one is instant.
// Results are shared by everyone who shares the reel: saved in reel_lookups under "<reel key>#<name>".
// Only a place on the list saved by /api/enrich-reel is saved, searched the way the list says, so a
// request can't save results for anything else. Any other place is searched but not saved.
// Body: { reelUrl, name, address, area }. Returns { success, query, candidates, saved }.
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const name = text(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name the listed place to look up' });

  const { cacheKey } = reelLookupKey(text(req.body?.reelUrl), req.body?.slide);
  const entry = cacheKey ? (await readCache('reel_lookups', cacheKey, REEL_CACHE_DAYS))?.data : null;
  const listed = entry?.place?.choices?.find((choice) => choice.name === name);
  const address = listed ? listed.address || '' : text(req.body?.address);
  const area = listed ? entry.place.area || '' : text(req.body?.area);
  const query = [name, address, area].filter(Boolean).join(', ');

  // The reel lookup already searched the first place.
  if (listed && squash(name) === squash(entry.place.placeName) && entry.candidates?.length) {
    return res.status(200).json({ success: true, query, candidates: entry.candidates, saved: true });
  }
  const key = listed ? `${cacheKey}#${squash(name)}` : null;
  const saved = key ? await readCache('reel_lookups', key, REEL_CACHE_DAYS) : null;
  if (saved?.data?.candidates?.length) {
    return res.status(200).json({ success: true, query: saved.data.query || query, candidates: saved.data.candidates, saved: true });
  }

  const reply = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await scrapeLocation.run({ method: 'POST', body: { action: 'search', query, placeName: name, location: query } }, reply);
  // "No results" is an empty list, not an error. It isn't saved, so the next try searches again.
  if (reply.code === 404) return res.status(200).json({ success: true, query, candidates: [], saved: false });
  if (reply.code >= 400 || !reply.body?.success) return res.status(reply.code >= 400 ? reply.code : 502).json(reply.body || {});
  const candidates = reply.body.candidates || [];
  if (key && candidates.length) await writeCache('reel_lookups', key, { query, candidates });
  return res.status(200).json({ success: true, query, candidates, saved: Boolean(key && candidates.length) });
}, { endpoint: 'listed-place', perHour: 100 });
