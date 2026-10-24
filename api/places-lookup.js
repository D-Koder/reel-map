const { requireUser } = require('./_lib/auth');
const placesApi = require('./_lib/places-api');

const text = (value, max = 300) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const number = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);

// The app's small Google lookups, so the API key stays on the server:
//   { action: 'autocomplete', text, lng, lat, sessionToken } -> { suggestions }
//   { action: 'retrieve', id, sessionToken, details? }       -> { place } (details: true adds place.details)
//   { action: 'nearby', lng, lat }                           -> { places }
//   { action: 'reverse', lng, lat }                          -> { address }
//   { action: 'geocode', address }                           -> { result }
// With no key set it answers 501, and the app uses Mapbox for the same job.
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!placesApi.enabled()) return res.status(501).json({ error: 'Google Places is not set up' });

  const { action } = req.body || {};
  const lng = number(req.body?.lng);
  const lat = number(req.body?.lat);
  try {
    if (action === 'autocomplete') {
      const input = text(req.body?.text);
      if (input.length < 2) return res.status(400).json({ error: 'Type something to search for' });
      const suggestions = await placesApi.autocomplete(input, {
        lng, lat, sessionToken: text(req.body?.sessionToken, 100),
      });
      return res.status(200).json({ suggestions });
    }
    if (action === 'retrieve') {
      const id = text(req.body?.id, 200);
      if (!id) return res.status(400).json({ error: 'Name the place to look up' });
      return res.status(200).json({ place: await placesApi.retrievePlace(id, text(req.body?.sessionToken, 100), req.body?.details === true) });
    }
    if (action === 'nearby' || action === 'reverse') {
      if (lng === null || lat === null) return res.status(400).json({ error: 'Give a longitude and latitude' });
      return res.status(200).json(action === 'nearby'
        ? { places: await placesApi.nearby(lng, lat) }
        : { address: await placesApi.reverseGeocode(lng, lat) });
    }
    if (action === 'geocode') {
      const address = text(req.body?.address);
      if (!address) return res.status(400).json({ error: 'Give an address to find' });
      return res.status(200).json({ result: await placesApi.geocodeAddress(address) });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.warn(`[places-lookup] ${action} failed: ${error.message}`);
    return res.status(502).json({ error: 'Google Places lookup failed', details: error.message });
  }
}, { endpoint: 'places-lookup', perHour: 600 });
