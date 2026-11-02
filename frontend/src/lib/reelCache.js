import { apiFetch } from './api';
import { readJSON, writeJSON } from './storage';
import { shareNote } from './shareText';

// Finished reel lookups kept on this device: the 5 most recent, each for 7 days. A reel looked up before
// opens straight away, even after the sheet or the app was closed.
const KEY = 'reelmap:reel-lookups';
const MAX_REELS = 5;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Lookups running now, by link, so a paste-time prefetch and Confirm share one request.
const running = new Map();

// [{ url, savedAt, data }], most recent first, with expired ones dropped.
function readStore() {
  const now = Date.now();
  return readJSON(KEY, []).filter((entry) => now - (entry?.savedAt ?? 0) < MAX_AGE_MS);
}

function saveReel(url, data) {
  const others = readStore().filter((entry) => entry.url !== url);
  writeJSON(KEY, [{ url, savedAt: Date.now(), data }, ...others].slice(0, MAX_REELS));
}

// The saved lookup for this link, or null.
export function savedReel(url) {
  return readStore().find((entry) => entry.url === url)?.data ?? null;
}

// Looks the reel up on the server, or joins the lookup already running for it. Resolves to
// { ok, status, data }; a successful lookup is saved on this device. The request isn't cancelled when
// the sheet closes, so the result is still saved for next time.
export function lookupReel(url) {
  const known = running.get(url);
  if (known) return known;
  const lookup = apiFetch('/api/enrich-reel', { body: JSON.stringify({ reelUrl: url, sharedText: shareNote(url) }) })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) saveReel(url, data);
      return { ok: response.ok, status: response.status, data };
    })
    .finally(() => running.delete(url));
  running.set(url, lookup);
  return lookup;
}
