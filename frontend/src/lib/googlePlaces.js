import { apiFetch } from './api';

// Google Maps lookups through /api/scrape-location (see api/scrape-location.js). A cold search can take
// over a minute (Chrome starting, then a slow Maps page), so both wait up to the server's 120s.
// { action: 'search', query } lists matching places; { action: 'details', placeUrl, ... } reads one.
export async function requestLocationApi(payload) {
  const response = await apiFetch('/api/scrape-location', {
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(115000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Google Maps returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// One place of a list post shared without a slide, through /api/listed-place (see api/listed-place.js):
// { reelUrl, name, address, area } → { query, candidates }. Its results are saved for everyone who
// shares the reel, so a second look is instant.
export async function requestListedPlace(payload) {
  const response = await apiFetch('/api/listed-place', {
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(115000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Google Maps returned HTTP ${response.status}`);
  return data;
}
