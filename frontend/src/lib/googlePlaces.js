import { apiFetch } from './api';
import { placeNameAt } from './mapboxSearch';

// Google Maps lookups through /api/scrape-location (see api/scrape-location.js).
// { action: 'search', query } lists matching places; { action: 'details', placeUrl, ... } reads one.
export async function requestLocationApi(payload) {
  const response = await apiFetch('/api/scrape-location', {
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Google Maps returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.action === 'details' ? withFullAddress(data) : data;
}

// Google lists a road or an area with only its city ("Shanghai"), so its address comes from Mapbox at
// its pin instead. Places with a street address are left as they are.
async function withFullAddress(details) {
  const { address = '', latitude, longitude } = details || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || /[\d,，]/.test(address)) return details;
  try {
    const full = await placeNameAt(longitude, latitude, AbortSignal.timeout(5000));
    return full ? { ...details, address: full } : details;
  } catch {
    return details;
  }
}

// One place of a list post shared without a slide, through /api/listed-place (see api/listed-place.js):
// { reelUrl, name, address, area } → { query, candidates }. Its results are saved for everyone who
// shares the reel, so a second look is instant.
export async function requestListedPlace(payload) {
  const response = await apiFetch('/api/listed-place', {
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Google Maps returned HTTP ${response.status}`);
  return data;
}
