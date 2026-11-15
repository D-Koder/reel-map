import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_TITLE, badgeStatus, demoCelebrationPending, computeProgress, earnedTitles, frameById, frameUnlocked, funTitles, titleLadders } from '../lib/achievements';
import { PRIZES, levelInfo, prizeToken, prizesBetween, totalXp } from '../lib/levels';
import { isLegacyAccount, planQuestGrants, questProgress, questXp } from '../lib/quests';
import { isInstalled } from '../lib/platform';
import { getPushSubscription } from '../lib/push';
import { clearDemoDone, demoDoneHere } from '../lib/demoHandoff';
import { readJSON, writeJSON } from '../lib/storage';

const prefsKey = (userId) => `reelmap:achievements:${userId}`;

// Badges earned, XP and level, level prizes, and the frame and title this person wears.
// A badge is earned when its goal is met and collected (+100 XP) when it is claimed; a level prize is claimed for +50 XP.
// Claims are kept on this device. XP from visits, reviews and saves is worked out from the data, so it follows the person.
// The frame and title are saved to the profile, so the people you share with see them. Until the database has those
// columns (profile.flairReady is false) they are kept on this device only.
export default function useAchievements({ userId, accountCreatedAt, showToast, ready, places, collections, profile, saveFlair }) {
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
  const NEW_ACCOUNT_MS = 60 * 60 * 1000;
  const accountAge = Date.now() - new Date(accountCreatedAt ?? 0).getTime();
  const isNewAccount = accountAge >= 0 && accountAge < NEW_ACCOUNT_MS;
  const granting = useRef(false);
  useEffect(() => {
    if (!ready || !accountBadge || !demoDoneHere()) return;
    // The account now carries the badge: this device's memory has done its job.
    if (profile.demoBadge != null) { clearDemoDone(); return; }
    if (!isNewAccount) { clearDemoDone(); return; }
    if (granting.current) return;
    granting.current = true;
    saveFlair?.({ demo_badge: 'earned' });
  }, [ready, accountBadge, profile?.demoBadge, isNewAccount, saveFlair]);

  // True while a Test Driver celebration is still to come for this new account, so the first-run tour can wait for it.
  // The not-yet-marked phase is only held for a few seconds, in case the mark could not be saved.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setGraceOver(true), 8000); return () => clearTimeout(timer); }, []);

  // Badges celebrated before claiming existed count as claimed ("seen" was their old name).
  const claimedBadges = useMemo(() => {
    const set = new Set(prefs.claimed ?? prefs.seen ?? []);
    if (accountBadge) { if (profile.demoBadge === 'claimed') set.add('demo'); else set.delete('demo'); }
    return set;
  }, [prefs.claimed, prefs.seen, accountBadge, profile?.demoBadge]);
  const claimedPrizes = useMemo(() => new Set(prefs.prizes ?? []), [prefs.prizes]);
  const claimedBadgeIds = useMemo(() => badges.filter((b) => b.earned && claimedBadges.has(b.id)).map((b) => b.id), [badges, claimedBadges]);

  // Badge perks (frames, titles, a texture) are yours as soon as the badge is earned. Level prizes need a claim.
  // `earnedIds` holds both: badge ids and a "prize:N" entry for each prize claimed.
  const earnedIds = useMemo(
    () => new Set([...earnedBadgeIds, ...[...claimedPrizes].map(prizeToken)]),
    [earnedBadgeIds, claimedPrizes]
  );

  // Starter quests: small one-time XP for things a new person needs to learn (see lib/quests.js). The done ones are noted
  // on the account (profiles.quests), or on this device until the database has that column.
  const questsOnAccount = Boolean(profile?.questsReady);
  const questNotes = (questsOnAccount ? profile.quests : prefs.quests) ?? {};
  const quests = useMemo(() => questProgress(questNotes), [questNotes]);

  const xp = useMemo(
    () => (ready ? totalXp({ places, collections, userId }, claimedBadgeIds, claimedPrizes.size, questXp(questNotes)) : 0),
    [ready, places, collections, userId, claimedBadgeIds, claimedPrizes, questNotes]
  );
  const level = useMemo(() => levelInfo(xp), [xp]);
  const readyBadges = useMemo(() => badges.filter((b) => b.earned && !claimedBadges.has(b.id)), [badges, claimedBadges]);
  // The things the app can only see on this device or from the browser: installed, and a push subscription.
  const [pushSubscribed, setPushSubscribed] = useState(false);
  useEffect(() => {
    let off = false;
    getPushSubscription().then((sub) => { if (!off) setPushSubscribed(Boolean(sub)); }, () => {});
    return () => { off = true; };
  }, []);
  const standalone = isInstalled();

  // Notes the app is already writing, so a second pass before the save comes back cannot grant the same quest twice.
  const inFlight = useRef({});
  const grant = useCallback((mark = null) => {
    const ctx = { userId, profile, places, collections, standalone, pushSubscribed, shortcutConnected: Boolean(profile?.shortcutConnected), notes: { ...questNotes, ...inFlight.current } };
    const plan = planQuestGrants(ctx, { now: new Date().toISOString(), mark, legacy: isLegacyAccount(accountCreatedAt) });
    if (!plan.granted.length) return;
    inFlight.current = plan.notes;
    if (questsOnAccount) saveFlair?.({ quests: plan.notes });
    else save({ quests: plan.notes });
    plan.announce.forEach((q) => showToast?.(`+${q.xp} XP · ${q.title}`));
  }, [userId, profile, places, collections, standalone, pushSubscribed, questNotes, questsOnAccount, accountCreatedAt, saveFlair, save, showToast]);
  useEffect(() => { if (ready) grant(); }, [ready, grant]);

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

  const pendingDemo = demoCelebrationPending({ ready, accountBadge, demoBadge: profile?.demoBadge, deviceDone: demoDoneHere(), isNewAccount, graceOver, demoReady });

  return {
    quests,
    markQuest: (id) => grant(id),
    pendingDemo,
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
