import { apiFetch } from './api';

// The Google place id inside a saved Maps link (…/maps/place/?q=place_id:ID), or '' for any other link.
export function placeIdFromMapsUrl(href) {
  try {
    const query = new URL(href).searchParams.get('q') || '';
    return query.startsWith('place_id:') ? query.slice('place_id:'.length) : '';
  } catch {
    return '';
  }
}

// A place's Google photo as { url, attribution } or null. Asked for once per place per visit and kept only in this
// tab's memory (Google's terms don't allow keeping its content): a place with no id, or no photo, costs nothing.
const asked = new Map();

export function photoFor(placeId) {
  if (!placeId) return Promise.resolve(null);
  const known = asked.get(placeId);
  if (known) return known;
  const lookup = apiFetch('/api/place-photo', { body: JSON.stringify({ placeId }) })
    .then(async (response) => {
      const { photoUrl = '', attribution = '' } = await response.json().catch(() => ({}));
      return response.ok && photoUrl ? { url: photoUrl, attribution } : null;
    })
    .catch(() => null);
  asked.set(placeId, lookup);
  return lookup;
}
