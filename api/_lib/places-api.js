// Google Places API (New), used instead of scraping Google Maps when GOOGLE_MAPS_API_KEY is set.
// Both calls return the same shapes the Maps scraper does, so callers don't care which one answered.
// A candidate's url is a Maps link that carries the place id (…/maps/place/?q=place_id:ID), which still
// opens the right place in Chrome if the scraper ever has to take over.

const BASE = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 8000;

const SEARCH_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.primaryTypeDisplayName',
  'places.rating', 'places.location',
].join(',');

const DETAIL_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'primaryTypeDisplayName', 'nationalPhoneNumber',
  'internationalPhoneNumber', 'websiteUri', 'regularOpeningHours.weekdayDescriptions', 'location',
].join(',');

function enabled() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

function placeUrl(id) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id)}`;
}

// The place id out of a link made by placeUrl, or '' for any other link.
function placeIdFromUrl(href) {
  try {
    const query = new URL(href).searchParams.get('q') || '';
    return query.startsWith('place_id:') ? query.slice('place_id:'.length) : '';
  } catch {
    return '';
  }
}

async function call(path, { method = 'GET', body, fields, language }) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': fields,
    },
    body: body ? JSON.stringify({ ...body, ...(language ? { languageCode: language } : {}) }) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Places API ${response.status}: ${data?.error?.message || response.statusText}`);
  }
  return data;
}

// Up to 5 matches for a search, as the scraper's candidates: { name, url, address, category, rating, summary }.
async function searchPlaces(query, language) {
  const data = await call('/places:searchText', {
    method: 'POST', body: { textQuery: query, pageSize: 5 }, fields: SEARCH_FIELDS, language,
  });
  return (data.places || []).slice(0, 5).map((place) => ({
    name: place.displayName?.text || '',
    url: placeUrl(place.id),
    address: place.formattedAddress || '',
    category: place.primaryTypeDisplayName?.text || '',
    rating: place.rating ? String(place.rating) : '',
    summary: '',
  })).filter((candidate) => candidate.name);
}

// "Monday: 9:00 AM – 5:00 PM" -> { days: 'Monday', time: '9:00 AM – 5:00 PM' }
function hoursRows(lines) {
  return (lines || []).map((line) => {
    const split = line.indexOf(':');
    return split > 0 ? { days: line.slice(0, split).trim(), time: line.slice(split + 1).trim() } : null;
  }).filter(Boolean);
}

// One place's details, as the scraper's details result. Menu and booking links aren't in the API.
async function placeDetails(placeId) {
  const place = await call(`/places/${encodeURIComponent(placeId)}`, { fields: DETAIL_FIELDS, language: 'en' });
  return {
    name: place.displayName?.text || '',
    subtitle: place.primaryTypeDisplayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    hours: hoursRows(place.regularOpeningHours?.weekdayDescriptions),
    websiteUrl: place.websiteUri || '',
    bookingUrl: '',
    mapsUrl: placeUrl(place.id || placeId),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    menuUrl: '',
    menuText: '',
  };
}

module.exports = { enabled, searchPlaces, placeDetails, placeIdFromUrl };
