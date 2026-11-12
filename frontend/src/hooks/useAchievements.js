import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_TITLE, badgeStatus, computeProgress, earnedTitles, frameById, frameUnlocked, funTitles, titleLadders } from '../lib/achievements';
import { readJSON, writeJSON } from '../lib/storage';

const prefsKey = (userId) => `reelmap:achievements:${userId}`;

// Badges earned, the frame and title this person wears, and the badges they have not been told about yet.
// The frame and title are saved to the profile, so the people you share with see them. Until the database has those
// columns (profile.flairReady is false) they are kept on this device only.
export default function useAchievements({ userId, ready, places, collections, profile, saveFlair }) {
  const [prefs, setPrefs] = useState(() => readJSON(prefsKey(userId), {}));

  const counts = useMemo(
    () => (ready ? computeProgress({ places, collections, profile, userId }) : {}),
    [ready, places, collections, profile, userId]
  );
  const badges = useMemo(
    () => (ready ? badgeStatus({ places, collections, profile, userId }, counts) : []),
    [ready, places, collections, profile, userId, counts]
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

  const synced = Boolean(profile?.flairReady);
  const storedFrame = synced ? profile.frame : prefs.frame;
  const storedTitle = synced ? profile.title : prefs.title;
  const frame = storedFrame && frameById(storedFrame) && frameUnlocked(frameById(storedFrame), earnedIds) ? storedFrame : null;
  const titles = useMemo(() => earnedTitles(earnedIds, counts), [earnedIds, counts]);
  const ladders = useMemo(() => titleLadders(counts), [counts]);
  const fun = useMemo(() => funTitles(counts), [counts]);
  const title = titles.includes(storedTitle) ? storedTitle : BASE_TITLE;

  // Choices made on this device before the profile could hold them move across once.
  const moved = useRef(false);
  useEffect(() => {
    if (!ready || !synced || moved.current) return;
    moved.current = true;
    const patch = {};
    if (!profile.frame && prefs.frame && frameUnlocked(frameById(prefs.frame) ?? {}, earnedIds)) patch.frame = prefs.frame;
    if (!profile.title && prefs.title && titles.includes(prefs.title)) patch.title = prefs.title;
    if (Object.keys(patch).length) saveFlair?.(patch);
  }, [ready, synced, profile, prefs.frame, prefs.title, earnedIds, titles, saveFlair]);

  return {
    badges,
    earnedIds,
    titles,
    ladders,
    fun,
    frame,
    title,
    pending,
    setFrame: (id) => {
      save({ frame: id });
      if (synced) saveFlair?.({ frame: id });
    },
    setTitle: (name) => {
      save({ title: name });
      if (synced) saveFlair?.({ title: name });
    },
    dismiss: (id) => save({ seen: [...new Set([...(prefs.seen ?? []), id])] }),
  };
}
