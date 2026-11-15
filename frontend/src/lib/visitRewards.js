// What marking a place done (and reviewing it) earned, worked out from the app's own XP and badge rules, so the
// "here is what you earned" screen can never disagree with the Achievements screen. Plain data in, plain data out.
//
// The "before" picture is the same places with this visit taken away: the place not done, and my review of it gone.
// Everything shown is the difference between that and now.

import { BADGES, computeProgress } from './achievements.js';
import { XP, computeActionXp } from './levels.js';

const mine = (reviews, userId) => (reviews ?? []).find((r) => r.user_id === userId);

export function visitRewards({ places, collections = [], userId, placeId, profile = null, now = new Date() }) {
  const entries = places.filter((p) => p.id === placeId);
  const doneEntry = entries.find((p) => p.booking?.done_at);
  if (!doneEntry) return null;

  const without = (keep) => places.map((p) => (p.id !== placeId ? p : {
    ...p,
    booking: p.booking ? { ...p.booking, done_at: null } : p.booking,
    reviews: keep ? p.reviews : (p.reviews ?? []).filter((r) => r.user_id !== userId),
  }));
  const input = (list) => ({ places: list, collections, userId });
  const before = without(false);
  const visitOnly = places.map((p) => (p.id !== placeId ? p : { ...p, reviews: (p.reviews ?? []).filter((r) => r.user_id !== userId) }));

  const base = computeActionXp(input(before)).total;
  const withVisit = computeActionXp(input(visitOnly)).total;
  const total = computeActionXp(input(places)).total - base;
  if (total <= 0) return null;

  // The parts, at their base value. The visit counts only when it earned something (the daily limit can stop it),
  // and a review or photos count only together with a visit.
  const parts = [];
  const review = mine(doneEntry.reviews, userId);
  const members = (collections.find((c) => c.id === doneEntry.collection_id)?.members ?? []).length;
  const together = members > 1;
  if (withVisit > base) {
    // The visit is worth the full 20, or 5 once five places were done the same day (before any friend multiplier).
    const visit = Math.round((withVisit - base) / (together ? XP.together : 1));
    parts.push({ label: 'Place done', value: visit });
    if ((review?.body ?? '').trim().length >= XP.minReview) parts.push({ label: 'Review', value: XP.review });
    const photos = Math.min(review?.photos?.length ?? 0, XP.photosMax);
    if (photos) parts.push({ label: `${photos} photo${photos > 1 ? 's' : ''}`, value: photos * XP.photo });
  }

  // Badges that moved because of this visit.
  const bCounts = computeProgress({ places: before, collections, profile, userId, now });
  const aCounts = computeProgress({ places, collections, profile, userId, now });
  const badges = BADGES.filter((b) => !b.soon).map((b) => {
    const from = Math.min(bCounts[b.id] ?? 0, b.target);
    const to = Math.min(aCounts[b.id] ?? 0, b.target);
    return { id: b.id, name: b.name, icon: b.icon, from, to, target: b.target, earned: to >= b.target && from < b.target };
  }).filter((b) => b.to > b.from);

  return { parts, together, total, badges, earnedCount: badges.filter((b) => b.earned).length };
}
