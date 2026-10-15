const { insertRow } = require('./_lib/lookup-cache');

// Saves a manual add's details and the person's comment to lookup_debug, so a missed place can be looked at later.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const text = (value, max = 2048) => (typeof value === 'string' ? value.trim().slice(0, max) : '') || null;
  const body = req.body || {};
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.slice(0, 20).map(({ name, address, category, url }) => ({ name, address, category, url }))
    : [];

  await insertRow('lookup_debug', {
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
    reason: 'Reported from manual add',
    comment: text(body.comment, 2000),
  });

  return res.status(200).json({ success: true });
};
