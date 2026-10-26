const { requireUser } = require('./_lib/auth');
const placesApi = require('./_lib/places-api');

// A place's first Google photo, for the RedNote card's background. Body: { placeId } → { photoUrl, attribution }
// (photoUrl '' when the place has no photo). The id is checked to be a plain Google place id before any call, so
// this can't be used to make Google requests for anything else. With no key set it answers 501 and the app shows
// the plain card. Billed per call, so the app asks once per place per visit.
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!placesApi.enabled()) return res.status(501).json({ error: 'Google Places is not set up' });
  const placeId = typeof req.body?.placeId === 'string' ? req.body.placeId.trim() : '';
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) return res.status(400).json({ error: 'Not a Google place id' });
  try {
    const photo = await placesApi.placePhoto(placeId);
    return res.status(200).json({ photoUrl: photo?.url || '', attribution: photo?.attribution || '' });
  } catch (error) {
    console.warn('Place photo failed:', error.message);
    return res.status(200).json({ photoUrl: '', attribution: '' });
  }
}, { endpoint: 'place-photo', perHour: 120 });
