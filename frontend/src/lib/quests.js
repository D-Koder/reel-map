// Starter quests: small, one-time XP for the things a new person needs to learn. Plain data and pure functions, so the
// same code runs in the app and in a test. Each quest says why it matters, how to do it, and how the app can tell.
//
//   detect(ctx)  returns true when the app can see the quest is done. A quest with no detect is marked by hand
//                (the name: only when the person confirms it, so the name from the demo or Google does not count).
//
// Done quests are kept as notes ({ questId: when }) on the account. XP comes from the notes, once each, and a note is
// never removed, so undoing the thing (deleting the reel) does not take the XP back and cannot be farmed.

import { BASE_TITLE } from './achievements.js';

// Accounts made before this are credited quietly for what they already did (no pop for every quest at once).
export const QUESTS_LAUNCH = '2026-11-16T00:00:00Z';

export const QUESTS = [
  {
    id: 'name', xp: 5, title: 'Make it yours: your name',
    why: 'Friends see this name, and it makes the app feel like yours.',
    how: 'Settings, tap your card, check your name and tap Save.',
  },
  {
    id: 'customise', xp: 10, title: 'Customise your profile',
    why: 'Frames and titles are how badges show off. This is where you wear them.',
    how: 'Settings, Customise profile: wear a frame, pick a title, or change your picture.',
    detect: ({ profile }) => Boolean(
      profile?.frame
      || (profile?.title && profile.title !== BASE_TITLE)
      || (profile?.avatar && profile.avatar !== '🙂')
      || profile?.avatar_url
    ),
  },
  {
    id: 'save', xp: 15, title: 'Save your first reel',
    why: 'Saving reels is the whole point: it turns scrolling into plans.',
    how: 'Copy a reel link, tap Paste a reel link, then Save.',
    detect: ({ places }) => (places?.length ?? 0) > 0,
  },
  {
    id: 'homescreen', xp: 15, title: 'Add Waylit to your Home Screen',
    why: 'It opens faster, and on iPhone notifications only work from the Home Screen.',
    how: 'In Safari tap Share, then Add to Home Screen, and open Waylit from the icon.',
    detect: ({ standalone }) => Boolean(standalone),
  },
  {
    id: 'notifications', xp: 10, title: 'Turn on notifications',
    why: 'Votes, bookings and your weekly pick find you instead of the other way round.',
    how: 'Settings, Notifications, Allow on this phone.',
    detect: ({ pushSubscribed }) => Boolean(pushSubscribed),
  },
  {
    id: 'shortcut', xp: 10, title: 'Set up the share shortcut',
    why: 'The fastest way to save: share a reel straight from Instagram or TikTok.',
    how: 'Settings, Shortcut: follow the steps, then share a reel to Waylit.',
    detect: ({ shortcutConnected }) => Boolean(shortcutConnected),
  },
  {
    id: 'invite', xp: 15, title: 'Invite your partner',
    why: 'Plans are better with two, and you see who is keen.',
    how: 'Open a collection\'s gear and tap Send invite to my partner. It counts once they join.',
    detect: ({ collections }) => (collections ?? []).some((c) => (c.members?.length ?? 0) > 1),
  },
  {
    id: 'vote', xp: 5, title: 'Vote on a place',
    why: 'Keen, Maybe or Meh tells your group what to do next.',
    how: 'Open a saved place and tap how keen you are.',
    detect: ({ places, userId }) => (places ?? []).some((p) => p.reactions?.[userId]),
  },
  {
    id: 'book', xp: 10, title: 'Book a time',
    why: 'This is the payoff: a real plan with a day and a time.',
    how: 'Open a place, pick a day and time, then Confirm.',
    detect: ({ places, userId }) => (places ?? []).some((p) => p.booking?.planned_at && (!p.booking.booked_by || p.booking.booked_by === userId)),
  },
];

export const questById = (id) => QUESTS.find((q) => q.id === id);

// The quests the app can see are done and that are not noted yet.
export function detectQuests(ctx) {
  const notes = ctx.notes ?? {};
  return QUESTS.filter((q) => q.detect && !notes[q.id] && q.detect(ctx)).map((q) => q.id);
}

// XP from done quests: one amount per known quest that has a note.
export const questXp = (notes) => QUESTS.reduce((sum, q) => sum + (notes?.[q.id] ? q.xp : 0), 0);

// What to do now: which quests to note, the notes afterwards, the XP they are worth, and which to announce with a pop.
// mark: a quest done by hand (the name). legacy: an account from before the launch, credited quietly.
export function planQuestGrants(ctx, { now, mark = null, legacy = false } = {}) {
  const notes = { ...(ctx.notes ?? {}) };
  const ids = detectQuests(ctx);
  if (mark && questById(mark) && !notes[mark] && !ids.includes(mark)) ids.push(mark);
  for (const id of ids) notes[id] = now;
  const granted = ids;
  return {
    granted,
    notes,
    xp: granted.reduce((sum, id) => sum + questById(id).xp, 0),
    announce: legacy ? [] : granted.map(questById),
  };
}

export const isLegacyAccount = (createdAt) => {
  const made = new Date(createdAt ?? NaN).getTime();
  return Number.isFinite(made) && made < new Date(QUESTS_LAUNCH).getTime();
};

// For the quest card: how far along, and the next few to do.
export function questProgress(notes) {
  const doneList = QUESTS.filter((q) => notes?.[q.id]);
  return {
    done: doneList.length,
    total: QUESTS.length,
    xp: questXp(notes),
    totalXp: QUESTS.reduce((sum, q) => sum + q.xp, 0),
    complete: doneList.length === QUESTS.length,
    next: QUESTS.filter((q) => !notes?.[q.id]),
    list: QUESTS.map((q) => ({ id: q.id, title: q.title, why: q.why, how: q.how, xp: q.xp, done: Boolean(notes?.[q.id]) })),
  };
}
