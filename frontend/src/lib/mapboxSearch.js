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
