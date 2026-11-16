const { requireUser } = require('./_lib/auth');
const { insertDebugRow } = require('./_lib/lookup-cache');
const { isUuid, placeTraceId, addReport } = require('./_lib/lookup-trace');

// Saves a manual add's details and the person's comment to lookup_debug, so a missed place can be looked at later.
// The report also goes on the lookup trace it is about: the trace of the lookup the app showed (traceId),
// or the trace of a saved place (placeId, read with the person's own sign-in).
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const text = (value, max = 2048) => (typeof value === 'string' ? value.trim().slice(0, max) : '') || null;
  const body = req.body || {};
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.slice(0, 20).map(({ name, address, category, url }) => ({ name, address, category, url }))
    : [];

  const token = String(req.headers?.authorization || '').match(/^Bearer\s+(\S+)$/i)?.[1];
  const traceId = isUuid(body.traceId) ? body.traceId : await placeTraceId(token, body.placeId);
  if (traceId) {
    await addReport(traceId, {
      at: new Date().toISOString(),
      by: req.user?.id || null,
      comment: text(body.comment, 2000),
      reason: text(body.reason, 200),
    });
  }

  await insertDebugRow({
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
    reason: text(body.reason, 200) || 'Reported from manual add',
    comment: text(body.comment, 2000),
    // The log the app showed for this lookup, one line per entry.
    logs: text(body.logs, 50000),
  });

  return res.status(200).json({ success: true });
}, { endpoint: 'report-lookup', perHour: 20 });
