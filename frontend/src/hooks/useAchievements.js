import { useCallback, useEffect, useMemo, useState } from 'react';
import { BASE_TITLE, badgeStatus, earnedTitles, frameById, frameUnlocked } from '../lib/achievements';
import { readJSON, writeJSON } from '../lib/storage';

const prefsKey = (userId) => `reelmap:achievements:${userId}`;

// Badges earned, the frame and title this person wears, and the badges they have not been told about yet.
// Choices are kept on this device for now, so a partner does not see your frame yet.
export default function useAchievements({ userId, ready, places, collections, profile }) {
  const [prefs, setPrefs] = useState(() => readJSON(prefsKey(userId), {}));

  const badges = useMemo(
    () => (ready ? badgeStatus({ places, collections, profile, userId }) : []),
    [ready, places, collections, profile, userId]
  );
  const earnedIds = useMemo(() => new Set(badges.filter((b) => b.earned).map((b) => b.id)), [badges]);

  const save = useCallback((patch) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeJSON(prefsKey(userId), next);
      return next;
    });
  }, [userId]);

  // The first time this runs, badges already earned are marked as seen. Only badges earned after that celebrate.
  const pending = useMemo(
    () => (prefs.seen ? badges.filter((b) => b.earned && !prefs.seen.includes(b.id)) : []),
    [badges, prefs.seen]
  );
  useEffect(() => {
    if (ready && !prefs.seen) save({ seen: [...earnedIds] });
  }, [ready, prefs.seen, earnedIds, save]);

  const frame = prefs.frame && frameById(prefs.frame) && frameUnlocked(frameById(prefs.frame), earnedIds) ? prefs.frame : null;
  const titles = useMemo(() => earnedTitles(earnedIds), [earnedIds]);
  const title = titles.includes(prefs.title) ? prefs.title : BASE_TITLE;

  return {
    badges,
    earnedIds,
    titles,
    frame,
    title,
    pending,
    setFrame: (id) => save({ frame: id }),
    setTitle: (name) => save({ title: name }),
    dismiss: (id) => save({ seen: [...new Set([...(prefs.seen ?? []), id])] }),
  };
}
