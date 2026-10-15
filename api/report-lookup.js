const { insertRow } = require('./_lib/lookup-cache');

// Saves a manual add's details and the person's comment to lookup_debug, so a missed place can be looked at later.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const text = (value, max = 2048) => (typeof value === 'string' ? value.trim().slice(0, max) : '') || null;
  const body = req.body || {};
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.slice(0, 20).map(({ name, address, category, url }) => ({ name, address, category, url }))
    : [];
  // The rest of the form (address, category, vibe…), kept small: short strings, numbers and flags only.
  const details = {};
  if (body.details && typeof body.details === 'object') {
    for (const [key, value] of Object.entries(body.details).slice(0, 30)) {
      if (typeof value === 'string') details[key] = value.slice(0, 2048);
      else if (typeof value === 'boolean' || typeof value === 'number') details[key] = value;
      else if (value && typeof value === 'object') {
        // One level deep, like verifiedPlace: { name, address, url }.
        details[key] = Object.fromEntries(Object.entries(value).slice(0, 10)
          .filter(([, inner]) => typeof inner === 'string').map(([k, inner]) => [k, inner.slice(0, 2048)]));
      }
    }
  }

  const saved = await insertRow('lookup_debug', {
    reel_url: text(body.reelUrl) || '',
    from_cache: false,
    caption: text(body.caption, 10000),
    creator: text(body.creator),
    location_tag: text(body.locationTag),
    place_name: text(body.placeName),
    location: text(body.location),
    venue: text(body.venue),
    query: text(body.query),
    candidates,
    reason: body.reelUrl ? 'Reported from add-place sheet' : 'Reported from manual add',
    comment: text(body.comment, 2000),
    details,
  });

  // Say so when it wasn't saved, so the sheet shows "Could not send" instead of "Sent".
  if (!saved) return res.status(500).json({ error: 'Could not save the report' });
  return res.status(200).json({ success: true });
};
