import { apiFetch } from './api';
import * as mapbox from './mapboxSearch';

// Google Places for search, nearby places and geocoding, through /api/places-lookup (the key stays on the
// server). Off unless VITE_GOOGLE_PLACES=1. When it's on and a Google call fails, or finds nothing where
// Mapbox might, Mapbox answers instead, so a missing key or a used-up daily limit never breaks search.

export const GOOGLE_PLACES = import.meta.env.VITE_GOOGLE_PLACES === '1';
// Whether anything can look places up: the Mapbox token, or Google.
export const CAN_SEARCH = Boolean(mapbox.MAPBOX_TOKEN) || GOOGLE_PLACES;

const GOOGLE_ID = 'g:';

async function google(payload, signal) {
  const response = await apiFetch('/api/places-lookup', { body: JSON.stringify(payload), signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Google Places returned HTTP ${response.status}`);
  return data;
}

// Tries Google, then falls back. Only a cancelled request is passed on as it is.
async function googleOr(tryGoogle, fallback, useFallback = () => false) {
  if (!GOOGLE_PLACES) return fallback();
  try {
    const result = await tryGoogle();
    return useFallback(result) ? fallback() : result;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return fallback();
  }
}

// Our category from Google's place types, e.g. ['coffee_shop', 'cafe'] → 'cafe'.
const categoryOf = (types = []) => mapbox.guessCategory(types.map((type) => type.replace(/_/g, ' ')));

// Same as mapboxSearch's: [{ id, name, address }], ranked near origin ([lng, lat]).
export function searchSuggestions(text, signal, origin, sessionToken) {
  return googleOr(
    async () => (await google({
      action: 'autocomplete', text, lng: origin?.[0], lat: origin?.[1], sessionToken,
    }, signal)).suggestions.map((suggestion) => ({ ...suggestion, id: GOOGLE_ID + suggestion.id })),
    () => mapbox.searchSuggestions(text, signal, origin, sessionToken),
    (found) => found.length === 0,
  );
}

// A Google suggestion for a business (not a street address): its hours and phone can be read.
const isBusiness = (types = []) => types.includes('establishment') || types.includes('point_of_interest');

// Same as mapboxSearch's: { lng, lat, name, address, category } for a picked suggestion. Pass the
// suggestion's types to also get a business's hours, phone and website in the same request, as `details`.
export async function retrievePlace(id, sessionToken, signal, suggestionTypes) {
  if (!id.startsWith(GOOGLE_ID)) return mapbox.retrievePlace(id, sessionToken, signal);
  const { place } = await google({
    action: 'retrieve', id: id.slice(GOOGLE_ID.length), sessionToken, details: isBusiness(suggestionTypes),
  }, signal);
  if (!Number.isFinite(place.lng) || !Number.isFinite(place.lat)) throw new Error('No coordinates for this place');
  return {
    lng: place.lng, lat: place.lat, name: place.name, address: place.address, category: categoryOf(place.types),
    details: place.details,
  };
}

// Places around a spot, nearest first, as MapScreen lists them. fallback runs Mapbox's search there.
export function nearbyPlaces(lng, lat, signal, fallback) {
  return googleOr(
    async () => (await google({ action: 'nearby', lng, lat }, signal)).places
      .map((place) => ({
        ...place,
        category: categoryOf(place.types),
        distance: distanceMetres(lng, lat, place.lng, place.lat),
      }))
      .sort((a, b) => a.distance - b.distance),
    fallback,
    (places) => places.length === 0,
  );
}

// The street address at a spot, or ''. fallback runs Mapbox's.
export function addressAtSpot(lng, lat, fallback) {
  return googleOr(
    async () => (await google({ action: 'reverse', lng, lat }, AbortSignal.timeout(8000))).address || '',
    fallback,
    (address) => !address,
  );
}

// { lng, lat, address } for some address text, or null. fallback runs Mapbox's.
export function findAddress(address, fallback) {
  return googleOr(
    async () => (await google({ action: 'geocode', address }, AbortSignal.timeout(12000))).result,
    fallback,
    (result) => !result,
  );
}

// Straight-line distance in metres between two points.
function distanceMetres(lng1, lat1, lng2, lat2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}
