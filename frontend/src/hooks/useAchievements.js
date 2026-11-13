import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_TITLE, badgeStatus, computeProgress, earnedTitles, frameById, frameUnlocked, funTitles, titleLadders } from '../lib/achievements';
import { PRIZES, levelInfo, prizeToken, prizesBetween, totalXp } from '../lib/levels';
import { clearDemoDone, demoDoneHere } from '../lib/demoHandoff';
import { readJSON, writeJSON } from '../lib/storage';

const prefsKey = (userId) => `reelmap:achievements:${userId}`;

// Badges earned, XP and level, level prizes, and the frame and title this person wears.
// A badge is earned when its goal is met and collected (+100 XP) when it is claimed; a level prize is claimed for +50 XP.
// Claims are kept on this device. XP from visits, reviews and saves is worked out from the data, so it follows the person.
// The frame and title are saved to the profile, so the people you share with see them. Until the database has those
// columns (profile.flairReady is false) they are kept on this device only.
export default function useAchievements({ userId, accountCreatedAt, ready, places, collections, profile, saveFlair }) {
  const [prefs, setPrefs] = useState(() => readJSON(prefsKey(userId), {}));

  // Test Driver (finish the no-login demo, then sign up). Once the database has profiles.demo_badge it belongs to the
  // account: it follows the person to any device and its celebration plays once. Until then it stays on this device.
  const accountBadge = Boolean(profile?.demoReady);
  const demoDone = accountBadge ? profile.demoBadge != null : Boolean(prefs.demo);
  const counts = useMemo(
    () => (ready ? computeProgress({ places, collections, profile, userId, demoDone }) : {}),
    [ready, places, collections, profile, userId, demoDone]
  );
  const badges = useMemo(
    () => (ready ? badgeStatus({ places, collections, profile, userId }, counts) : []),
    [ready, places, collections, profile, userId, counts]
  );
  const earnedBadgeIds = useMemo(() => new Set(badges.filter((b) => b.earned).map((b) => b.id)), [badges]);

  const save = useCallback((patch) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeJSON(prefsKey(userId), next);
      return next;
    });
  }, [userId]);

  // Device fallback (no database column yet): the demo, finished on this device, is kept in this account's prefs.
  useEffect(() => {
    if (ready && !accountBadge && !prefs.demo && demoDoneHere()) save({ demo: true });
  }, [ready, accountBadge, prefs.demo, save]);

  // Signing in with Google cannot carry the demo with it, so a brand-new account (made in the last hour) on the
  // device that finished the demo is marked here instead. An account that already existed is never marked.
  useEffect(() => {
    if (!ready || !accountBadge || !demoDoneHere()) return;
    // The account now carries the badge (or is not new enough to earn it): this device's memory has done its job.
    if (profile.demoBadge != null) { clearDemoDone(); return; }
    const age = Date.now() - new Date(accountCreatedAt ?? 0).getTime();
    if (age >= 0 && age < 60 * 60 * 1000) saveFlair?.({ demo_badge: 'earned' });
    clearDemoDone();
  }, [ready, accountBadge, profile?.demoBadge, accountCreatedAt, saveFlair]);

  // Badges celebrated before claiming existed count as claimed ("seen" was their old name).
  const claimedBadges = useMemo(() => {
    const set = new Set(prefs.claimed ?? prefs.seen ?? []);
    if (accountBadge) { if (profile.demoBadge === 'claimed') set.add('demo'); else set.delete('demo'); }
    return set;
  }, [prefs.claimed, prefs.seen, accountBadge, profile?.demoBadge]);
  const claimedPrizes = useMemo(() => new Set(prefs.prizes ?? []), [prefs.prizes]);
  const claimedBadgeCount = badges.filter((b) => b.earned && claimedBadges.has(b.id)).length;

  // Badge perks (frames, titles, a texture) are yours as soon as the badge is earned. Level prizes need a claim.
  // `earnedIds` holds both: badge ids and a "prize:N" entry for each prize claimed.
  const earnedIds = useMemo(
    () => new Set([...earnedBadgeIds, ...[...claimedPrizes].map(prizeToken)]),
    [earnedBadgeIds, claimedPrizes]
  );

  const xp = useMemo(
    () => (ready ? totalXp({ places, collections, userId }, claimedBadgeCount, claimedPrizes.size) : 0),
    [ready, places, collections, userId, claimedBadgeCount, claimedPrizes]
  );
  const level = useMemo(() => levelInfo(xp), [xp]);
  const readyBadges = useMemo(() => badges.filter((b) => b.earned && !claimedBadges.has(b.id)), [badges, claimedBadges]);
  const prizes = useMemo(() => {
    const next = PRIZES.find((p) => p.level > level.level);
    return PRIZES.map((p) => ({
      ...p,
      state: claimedPrizes.has(p.level) ? 'got' : p.level <= level.level ? 'ready' : p === next ? 'next' : 'locked',
    }));
  }, [level.level, claimedPrizes]);

  // Moving up a level celebrates once. The first time this runs the current level is taken as already seen.
  const levelSeen = prefs.levelSeen;
  useEffect(() => {
    if (ready && levelSeen === undefined) save({ levelSeen: level.level });
  }, [ready, levelSeen, level.level, save]);
  const levelUp = useMemo(
    () => (ready && levelSeen !== undefined && level.level > levelSeen
      ? { from: levelSeen, to: level.level, prizes: prizesBetween(levelSeen, level.level) }
      : null),
    [ready, levelSeen, level.level]
  );

  // What was just claimed, to celebrate. Not kept between visits.
  const [reward, setReward] = useState(null);

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

  const claimBadge = (id) => {
    const badge = badges.find((b) => b.id === id);
    if (!badge?.earned || claimedBadges.has(id)) return;
    save({ claimed: [...claimedBadges, id] });
    if (id === 'demo' && accountBadge) saveFlair?.({ demo_badge: 'claimed' });
    setReward({ kind: 'badge', badge });
  };

  // Test Driver celebrates by itself the first time the account is open, then never again: it is marked
  // claimed on the account, so a second device stays quiet. Held for a moment so the app can settle first.
  const autoCelebrated = useRef(false);
  const demoReady = readyBadges.some((b) => b.id === 'demo');
  useEffect(() => {
    if (!ready || !demoReady || autoCelebrated.current) return undefined;
    const timer = setTimeout(() => { autoCelebrated.current = true; claimBadge('demo'); }, 1200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, demoReady]);

  return {
    badges,
    earnedIds,
    titles,
    ladders,
    fun,
    frame,
    title,
    xp,
    level,
    prizes,
    readyBadges,
    claimedBadges,
    // The level shown on the profile once the Level 1 prize is claimed.
    levelChip: claimedPrizes.has(1) ? level.level : null,
    reward,
    levelUp,
    claimBadge,
    claimPrize: (levelNumber) => {
      const prize = PRIZES.find((p) => p.level === levelNumber);
      if (!prize || levelNumber > level.level || claimedPrizes.has(levelNumber)) return;
      save({ prizes: [...claimedPrizes, levelNumber] });
      setReward({ kind: 'prize', prize });
    },
    dismissReward: () => setReward(null),
    dismissLevelUp: () => save({ levelSeen: level.level }),
    setFrame: (id) => {
      save({ frame: id });
      if (synced) saveFlair?.({ frame: id });
    },
    setTitle: (name) => {
      save({ title: name });
      if (synced) saveFlair?.({ title: name });
    },
  };
}
