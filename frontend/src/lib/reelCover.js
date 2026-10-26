import { apiFetch } from './api';
import { readJSON, writeJSON } from './storage';

// A RedNote note's cover picture link (see api/reel-cover.js), kept on this device by note link so each is asked
// for once. Only the link is kept: the picture itself is always loaded from RedNote's server.
const KEY = 'reelmap:rednote-covers';
const KEPT = 100;
const running = new Map();

export function savedCover(reelUrl) {
  return readJSON(KEY, {})[reelUrl] ?? '';
}

// Resolves to the cover link, or '' when there is none or the lookup failed (nothing is kept then).
export function coverFor(reelUrl) {
  const saved = savedCover(reelUrl);
  if (saved) return Promise.resolve(saved);
  const known = running.get(reelUrl);
  if (known) return known;
  const lookup = apiFetch('/api/reel-cover', { body: JSON.stringify({ reelUrl }) })
    .then(async (response) => {
      const { coverUrl = '' } = await response.json().catch(() => ({}));
      if (response.ok && coverUrl) {
        const covers = readJSON(KEY, {});
        writeJSON(KEY, Object.fromEntries(Object.entries({ ...covers, [reelUrl]: coverUrl }).slice(-KEPT)));
      }
      return response.ok ? coverUrl : '';
    })
    .catch(() => '')
    .finally(() => running.delete(reelUrl));
  running.set(reelUrl, lookup);
  return lookup;
}
