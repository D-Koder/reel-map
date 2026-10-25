const { requireUser } = require('./_lib/auth');
const scrapeLocation = require('./scrape-location');
const { reelLookupKey } = require('./_lib/reel-url');
const { readCache, writeCache } = require('./_lib/lookup-cache');
const { squash } = require('./_lib/names');
const { requestCountry } = require('./_lib/country');

// Same as in enrich-reel.js.
const REEL_CACHE_DAYS = 100;

const text = (value) => (typeof value === 'string' ? value.trim().slice(0, 500) : '');

// One place of a list post shared without a slide ("4 must-try spots"): its Google Maps results.
// The app asks for every listed place as soon as the list shows, so tapping one is instant.
// Results are shared by everyone who shares the reel: saved in reel_lookups under "<reel key>#<name>".
// Only a place on the list saved by /api/enrich-reel is saved, searched the way the list says, so a
// request can't save results for anything else. Any other place is searched but not saved.
// Body: { reelUrl, name, address, area, fresh }. fresh: search Google again, skipping saved results. Returns { success, query, candidates, saved }.
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const name = text(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name the listed place to look up' });

  const { cacheKey } = reelLookupKey(text(req.body?.reelUrl), req.body?.slide);
  const entry = cacheKey ? (await readCache('reel_lookups', cacheKey, REEL_CACHE_DAYS))?.data : null;
  const listed = entry?.place?.choices?.find((choice) => choice.name === name);
  const address = listed ? listed.address || '' : text(req.body?.address);
  // With no area anywhere, the person's country: Google answers a bare "Event Cinemas Macquarie" with
  // places near the server (Macquarie Capital in New York).
  const area = (listed ? listed.area || entry.place.area || text(req.body?.area) : text(req.body?.area)) || requestCountry(req);
  // A place written in English but local in another script (Zhapu Road Bridge) is searched by its local
  // name (乍浦路桥), which Google Maps finds; the English one often lands on something else (the road).
  let query = [listed?.localName || name, address, area].filter(Boolean).join(', ');

  const fresh = req.body?.fresh === true;
  // The reel lookup already searched the first place. Same name and same address, so a second branch
  // with the same name (Swanston St after Bourke St) is searched on its own.
  const isFirst = listed && squash(name) === squash(entry.place.placeName) &&
    (!address || squash(entry.place.location || '').includes(squash(address)));
  if (!fresh && isFirst && entry.candidates?.length) {
    return res.status(200).json({ success: true, query, candidates: entry.candidates, saved: true });
  }
  // By name and address, so two branches with the same name (Nana's Green Tea on Bourke St and on
  // Swanston St) never share saved results.
  const key = listed ? `${cacheKey}#${squash(name)}${address ? `@${squash(address)}` : ''}` : null;
  const saved = key && !fresh ? await readCache('reel_lookups', key, REEL_CACHE_DAYS) : null;
  // Results saved without the place's local name (by older code, or before the AI gave one) are searched again.
  if (!fresh && saved?.data?.candidates?.length && (saved.data.localName || '') === (listed.localName || '')) {
    return res.status(200).json({ success: true, query: saved.data.query || query, candidates: saved.data.candidates, saved: true });
  }

  const search = async () => {
    const reply = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await scrapeLocation.run({ method: 'POST', body: { action: 'search', query, placeName: name, location: query } }, reply);
    return reply;
  };
  let reply = await search();
  // Nothing for the AI's local name (it may have it wrong): the name as the post wrote it is searched instead.
  if (listed?.localName && (reply.code >= 400 || !reply.body?.candidates?.length)) {
    query = [name, address, area].filter(Boolean).join(', ');
    reply = await search();
  }
  // "No results" is an empty list, not an error. It isn't saved, so the next try searches again.
  if (reply.code === 404) return res.status(200).json({ success: true, query, candidates: [], saved: false });
  if (reply.code >= 400 || !reply.body?.success) return res.status(reply.code >= 400 ? reply.code : 502).json(reply.body || {});
  const candidates = reply.body.candidates || [];
  if (key && candidates.length) {
    await writeCache('reel_lookups', key, { query, candidates, ...(listed.localName ? { localName: listed.localName } : {}) });
  }
  return res.status(200).json({ success: true, query, candidates, saved: Boolean(key && candidates.length) });
}, { endpoint: 'listed-place', perHour: 100 });
