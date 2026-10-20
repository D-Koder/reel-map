// Mapbox Search Box API, shared by the map's search bar and the place search in Add and Edit.
// Suggestions come first. A place's coordinates are fetched only when it is picked.
// One session token groups a search's suggestions and the pick that follows, for Mapbox billing.

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
export const MELBOURNE_CENTER = [144.9631, -37.8136];

export const SEARCH_BASE = 'https://api.mapbox.com/search/searchbox/v1';
// Named places (poi) as well as addresses, so "Melbourne Museum" finds the museum.
const SEARCH_TYPES = 'poi,address,place,locality,neighborhood';

// Our category from Mapbox's POI categories, e.g. ["coffee", "cafe"] → 'cafe'.
export function guessCategory(poiCategories = []) {
  const text = poiCategories.join(' ').toLowerCase();
  if (/caf|coffee|tea|bakery|dessert/.test(text)) return 'cafe';
  if (/venue|theat|cinema|museum|gallery|stadium|arena|club|concert|entertainment|attraction|park/.test(text)) return 'event';
  return 'food';
}

// Suggestions for a search box, ranked near `origin` ([lng, lat]).
export async function searchSuggestions(text, signal, origin, sessionToken) {
  const url = new URL(`${SEARCH_BASE}/suggest`);
  url.searchParams.set('q', text);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('session_token', sessionToken);
  url.searchParams.set('types', SEARCH_TYPES);
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', '5');
  url.searchParams.set('proximity', `${origin[0]},${origin[1]}`);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox search returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.suggestions || []).map((suggestion) => ({
    id: suggestion.mapbox_id,
    name: suggestion.name,
    address: suggestion.full_address || suggestion.place_formatted || suggestion.name,
  }));
}

// Coordinates and details for one picked suggestion: { lng, lat, name, address, category }.
export async function retrievePlace(mapboxId, sessionToken, signal) {
  const url = new URL(`${SEARCH_BASE}/retrieve/${encodeURIComponent(mapboxId)}`);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('session_token', sessionToken);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox retrieve returned HTTP ${response.status}`);
  const feature = (await response.json()).features?.[0];
  const [lng, lat] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('No coordinates for this place');
  const props = feature.properties ?? {};
  return {
    lng,
    lat,
    name: props.name || '',
    address: props.full_address || props.place_formatted || '',
    category: props.poi_category ? guessCategory(props.poi_category) : null,
  };
}

// The street, suburb and state at a spot, for Google results whose list card has no address:
// { street: '1 Rainbow Alley', area: 'Melbourne VIC' }. Where Mapbox has no numbered address (most of
// China), the street or district there instead: { street: 'Huanghe Road', area: 'Huangpu Shanghai' }.
// Null when Mapbox has nothing there.
export async function addressAt(lng, lat, signal) {
  return await reverseAt(lng, lat, 'address', signal) ?? reverseAt(lng, lat, 'street,neighborhood,locality,place', signal);
}

async function reverseAt(lng, lat, types, signal) {
  const url = new URL(`${SEARCH_BASE}/reverse`);
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('types', types);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'en');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox reverse returned HTTP ${response.status}`);
  const props = (await response.json()).features?.[0]?.properties;
  if (!props) return null;
  const context = props.context ?? {};
  const suburb = context.locality?.name || context.place?.name || '';
  const state = context.region?.region_code || context.region?.name || '';
  // A district or city found by itself is the area, not a street ("Huangpu", not "Huangpu, Huangpu").
  const street = ['address', 'street'].includes(props.feature_type) ? props.name || '' : context.address?.name || '';
  const area = [street ? '' : props.name, suburb, state].filter((part, i, all) => part && all.indexOf(part) === i).join(' ');
  return { street, area };
}

// The address at a spot from Mapbox Geocoding, for a Google place listed only as a city (a road or
// an area: "Shanghai"): "Zhapu Rd, Hongkou District, Shanghai, China". '' when Mapbox has nothing.
// v5 has no "street" type: a road is an "address" feature without a number. Asking for "street" fails the whole request.
export async function placeNameAt(lng, lat, signal) {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('types', 'address,neighborhood,locality,place');
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'en');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox geocoding returned HTTP ${response.status}`);
  return (await response.json()).features?.[0]?.place_name || '';
}

// The best match for some text, ranked near the person (by their IP): { lng, lat, address }, or null.
async function forwardSearch(text, types, signal) {
  const url = new URL(`${SEARCH_BASE}/forward`);
  url.searchParams.set('q', text);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('types', types);
  url.searchParams.set('proximity', 'ip');
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox search returned HTTP ${response.status}`);
  const feature = (await response.json()).features?.[0];
  const [lng, lat] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // A suburb has no full_address: its name and place_formatted ("Queensland, Australia") are joined.
  const props = feature.properties ?? {};
  const address = props.full_address || [props.name || text, props.place_formatted].filter(Boolean).join(', ');
  return { lng, lat, address };
}

// A suburb or city by name, for a business with no shop, so "Heathwood" is the one in the person's
// part of the world.
export function findArea(text, signal) {
  return forwardSearch(text, 'neighborhood,locality,place,district', signal);
}

// A place, street address or area from text like "Name, Address", for an imported place with no pin.
export function findPlace(text, signal) {
  return forwardSearch(text, 'poi,address,neighborhood,locality,place', signal);
}
