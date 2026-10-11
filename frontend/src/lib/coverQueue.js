// Cover refresh rules. Keep these numbers together so they're easy to tune.
export const MAX_CONCURRENT = 5;
export const MAX_PER_SESSION = 60;
const DAY = 24 * 60 * 60 * 1000;

// Decides whether a Reel's cover needs fetching again.
// `row` is the saved cover (or undefined), `broken` is true when the image failed to load on screen.
export function needsRefresh(row, broken, now = Date.now()) {
  if (!row) return true;
  const age = now - new Date(row.checked_at).getTime();
  // A Reel that had no cover is only retried after a week.
  if (row.status === 'missing') return age > 7 * DAY;
  // A broken image is retried after a day, so a dead link doesn't get fetched on every view.
  if (broken) return age > DAY;
  // Otherwise refresh covers older than two days, before they are likely to expire.
  return age > 2 * DAY;
}

// Runs fetches with at most MAX_CONCURRENT in flight. Waiting Reels run first-in, first-out.
// `cancel` removes a Reel that has scrolled away before its turn.
export function createCoverQueue({ fetchCover, onResult }) {
  const waiting = new Set();
  const active = new Set();
  let sentThisSession = 0;

  const pump = () => {
    while (active.size < MAX_CONCURRENT && waiting.size > 0 && sentThisSession < MAX_PER_SESSION) {
      const reelUrl = waiting.values().next().value;
      waiting.delete(reelUrl);
      active.add(reelUrl);
      sentThisSession += 1;
      fetchCover(reelUrl)
        .then((result) => onResult(reelUrl, result))
        // A failed fetch is not saved, so it is simply tried again the next time the card is on screen.
        .catch(() => {})
        .finally(() => {
          active.delete(reelUrl);
          pump();
        });
    }
  };

  return {
    request(reelUrl) {
      if (active.has(reelUrl) || waiting.has(reelUrl)) return;
      waiting.add(reelUrl);
      pump();
    },
    cancel(reelUrl) {
      waiting.delete(reelUrl);
    },
  };
}
