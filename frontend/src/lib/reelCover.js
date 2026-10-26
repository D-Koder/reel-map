import { apiFetch } from './api';
import { readJSON, writeJSON } from './storage';

// A RedNote note's cover picture link and title (see api/reel-cover.js), kept on this device by note link so each
// is asked for once. Only the link and the title are kept: the picture itself is always loaded from RedNote's server.
const KEY = 'reelmap:rednote-covers';
const KEPT = 100;
const running = new Map();

// { coverUrl, title } kept for a note, or null. (An older version kept just the picture link.)
export function savedCover(reelUrl) {
  const saved = readJSON(KEY, {})[reelUrl];
  if (!saved) return null;
  return typeof saved === 'string' ? { coverUrl: saved, title: '' } : saved;
}

// Resolves to { coverUrl, title, reason }: what the page gave, and why not when it gave nothing (nothing is kept then).
export function coverFor(reelUrl) {
  const saved = savedCover(reelUrl);
  if (saved?.title) return Promise.resolve({ ...saved, reason: '' });
  const known = running.get(reelUrl);
  if (known) return known;
  const lookup = apiFetch('/api/reel-cover', { body: JSON.stringify({ reelUrl }) })
    .then(async (response) => {
      const { coverUrl = '', title = '', reason = '' } = await response.json().catch(() => ({}));
      if (!response.ok) return { coverUrl: '', title: '', reason: `HTTP ${response.status}` };
      if (coverUrl || title) {
        const covers = readJSON(KEY, {});
        writeJSON(KEY, Object.fromEntries(Object.entries({ ...covers, [reelUrl]: { coverUrl, title } }).slice(-KEPT)));
      }
      return { coverUrl, title, reason };
    })
    .catch((error) => ({ coverUrl: '', title: '', reason: `request failed: ${error.message}` }))
    .finally(() => running.delete(reelUrl));
  running.set(reelUrl, lookup);
  return lookup;
}
