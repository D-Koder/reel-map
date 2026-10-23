// Google Places API (New), used instead of scraping Google Maps when GOOGLE_MAPS_API_KEY is set.
// Both calls return the same shapes the Maps scraper does, so callers don't care which one answered.
// A candidate's url is a Maps link that carries the place id (…/maps/place/?q=place_id:ID), which still
// opens the right place in Chrome if the scraper ever has to take over.

const BASE = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 8000;
const BIAS_RADIUS_METRES = 20000;

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

async function call(path, { method = 'GET', body, fields, language, base = BASE }) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      ...(fields ? { 'X-Goog-FieldMask': fields } : {}),
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
// bias ({ lng, lat }) ranks places near that spot higher. It's a hint, so places further away still show.
async function searchPlaces(query, language, bias) {
  const body = { textQuery: query, pageSize: 5 };
  if (bias && Number.isFinite(bias.lng) && Number.isFinite(bias.lat)) {
    body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: BIAS_RADIUS_METRES } };
  }
  const data = await call('/places:searchText', { method: 'POST', body, fields: SEARCH_FIELDS, language });
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

// Suggestions as you type, ranked around [lng, lat] if given: [{ id, name, address }].
// The session token groups the typing and the pick that follows (retrievePlace) into one billed search.
async function autocomplete(text, { lng, lat, sessionToken } = {}) {
  const body = { input: text, ...(sessionToken ? { sessionToken } : {}) };
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } };
  }
  const data = await call('/places:autocomplete', { method: 'POST', body, language: 'en' });
  return (data.suggestions || []).map((item) => item.placePrediction).filter(Boolean).slice(0, 5).map((prediction) => ({
    id: prediction.placeId,
    name: prediction.structuredFormat?.mainText?.text || prediction.text?.text || '',
    address: prediction.structuredFormat?.secondaryText?.text || prediction.text?.text || '',
  })).filter((suggestion) => suggestion.id && suggestion.name);
}

// The picked suggestion's spot and name: { lng, lat, name, address, types }.
async function retrievePlace(placeId, sessionToken) {
  const path = `/places/${encodeURIComponent(placeId)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''}`;
  const place = await call(path, {
    fields: 'id,displayName,formattedAddress,location,types,primaryType', language: 'en',
  });
  return {
    lng: place.location?.longitude, lat: place.location?.latitude,
    name: place.displayName?.text || '', address: place.formattedAddress || '',
    types: place.types || [],
  };
}

// Places around a spot, nearest first: [{ id, name, address, lng, lat, types }]. Google allows up to 20.
async function nearby(lng, lat, radius = 500) {
  const data = await call('/places:searchNearby', {
    method: 'POST',
    body: {
      maxResultCount: 20, rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    },
    fields: 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
    language: 'en',
  });
  return (data.places || []).map((place) => ({
    id: place.id, name: place.displayName?.text || '', address: place.formattedAddress || '',
    lng: place.location?.longitude, lat: place.location?.latitude, types: place.types || [],
  })).filter((place) => place.name && Number.isFinite(place.lng) && Number.isFinite(place.lat));
}

// Geocoding API v4. Each result has formattedAddress and location { latitude, longitude }.
const GEOCODE_BASE = 'https://geocode.googleapis.com/v4beta/geocode';
const GEOCODE_FIELDS = 'results.formattedAddress,results.location';

// The address at a spot, or ''.
async function reverseGeocode(lng, lat) {
  const data = await call(`/location/${lat},${lng}`, { base: GEOCODE_BASE, fields: GEOCODE_FIELDS });
  return data.results?.[0]?.formattedAddress || '';
}

// The spot for an address: { lng, lat, address }, or null.
async function geocodeAddress(address) {
  const data = await call(`/address/${encodeURIComponent(address)}`, { base: GEOCODE_BASE, fields: GEOCODE_FIELDS });
  const result = data.results?.[0];
  const { latitude, longitude } = result?.location || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lng: longitude, lat: latitude, address: result.formattedAddress || address };
}

// Where to look first for a search: the spot of the address or area in `location`, or null. Only text with
// a comma or a digit counts (a street address or "suburb, city"); a bare name would geocode to anything.
// Remembered while the server instance lives, so a reel's second search costs nothing.
const biasCache = new Map();
async function biasFor(location) {
  const text = String(location || '').trim();
  if (!text || !/[,\d]/.test(text)) return null;
  if (!biasCache.has(text)) {
    if (biasCache.size > 500) biasCache.clear();
    biasCache.set(text, geocodeAddress(text).catch(() => null));
  }
  return biasCache.get(text);
}

module.exports = {
  biasFor, enabled, searchPlaces, placeDetails, placeIdFromUrl,
  autocomplete, retrievePlace, nearby, reverseGeocode, geocodeAddress,
};
