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

// A place's Google photo as { url, attribution } or null. Asked for once per place per browser tab session: found
// photos are kept in this tab's sessionStorage (gone when the tab closes), and a place with no id or no photo
// costs nothing. A kept photo that no longer loads is dropped by forgetPhoto and asked for again.
const KEY = 'reelmap:place-photos';
const asked = new Map();

function kept() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function keep(placeId, photo) {
  try {
    const all = kept();
    if (photo) all[placeId] = photo;
    else delete all[placeId];
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not kept. The photo is just asked for again on the next open.
  }
}

export function forgetPhoto(placeId) {
  asked.delete(placeId);
  keep(placeId, null);
}

export function photoFor(placeId) {
  if (!placeId) return Promise.resolve(null);
  const known = asked.get(placeId);
  if (known) return known;
  const saved = kept()[placeId];
  if (saved) {
    const lookup = Promise.resolve(saved);
    asked.set(placeId, lookup);
    return lookup;
  }
  const lookup = apiFetch('/api/place-photo', { body: JSON.stringify({ placeId }) })
    .then(async (response) => {
      const { photoUrl = '', attribution = '' } = await response.json().catch(() => ({}));
      const photo = response.ok && photoUrl ? { url: photoUrl, attribution } : null;
      if (photo) keep(placeId, photo);
      return photo;
    })
    .catch(() => null);
  asked.set(placeId, lookup);
  return lookup;
}
