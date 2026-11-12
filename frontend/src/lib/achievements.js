// Badges, profile frames and titles. Everything here is plain data and pure functions, so it runs the
// same in the app and in a test. Progress is worked out from places and bookings the app already loads.
//
// A badge with `soon: true` needs data the app does not load yet (cities, repeat visits, how a place
// was saved). It shows as "Coming soon" and never earns until its progress function is filled in.

const DAY = 24 * 60 * 60 * 1000;
const FOOD = new Set(['food', 'cafe']);

// `reward` is what the badge unlocks besides its frame and title. `rewardBuilt` is false until that feature exists,
// so the app never promises something it cannot give.
export const BADGES = [
  { id: 'explorer', name: 'Explorer', icon: 'Compass', target: 5, how: 'Mark places as done', reward: 'Custom pin colours', rewardBuilt: false, frame: 'bronze', title: 'Explorer' },
  { id: 'local', name: 'Local', icon: 'Building2', target: 10, how: 'Visit places in one city', reward: 'Shareable city card', rewardBuilt: false, frame: 'silver', title: 'Local', soon: true },
  { id: 'curator', name: 'Curator', icon: 'MapPin', target: 25, how: 'Save places', reward: 'Surprise me filters', rewardBuilt: false, frame: 'pin', title: 'Curator' },
  { id: 'globetrotter', name: 'Globetrotter', icon: 'Globe', target: 3, how: 'Visit places in different cities', reward: 'Map stamps on your profile', rewardBuilt: false, frame: 'gold', title: 'Pathfinder', soon: true },
  { id: 'planner', name: 'Planner', icon: 'Link', target: 3, how: 'Book places', reward: 'Shared collection theme', rewardBuilt: false, frame: 'couple', title: 'Partner in Crime' },
  { id: 'insync', name: 'In Sync', icon: 'Heart', target: 5, how: 'Places you both voted Keen', reward: 'Matches list', rewardBuilt: false, frame: 'hearts', title: 'Perfect Match' },
  { id: 'reelmaster', name: 'Reel Master', icon: 'PlayCircle', target: 100, how: 'Save places from reels', reward: 'Year-in-review recap', rewardBuilt: false, frame: 'rainbow', title: 'Legend', soon: true },
  { id: 'regular', name: 'Regular', icon: 'Repeat', target: 3, how: 'Go to the same place again', reward: 'Favourite star on the map', rewardBuilt: false, title: 'Regular', soon: true },
  { id: 'foodie', name: 'Foodie', icon: 'UtensilsCrossed', target: 10, how: 'Visit food places', reward: 'Food-only Surprise me', rewardBuilt: false, title: 'Foodie' },
  { id: 'streak', name: 'Date Night Streak', icon: 'Flame', target: 4, how: 'Weeks in a row with a visit', reward: 'Streak flame by your avatar', rewardBuilt: false, title: 'Dream Team' },
  { id: 'first', name: 'First Date Night', icon: 'Calendar', target: 1, how: 'Your first done place together', reward: 'Dated memory in your timeline', rewardBuilt: false, title: 'Plus-One' },
  { id: 'year', name: 'One Year Ago', icon: 'Clock', target: 1, how: 'A place you visited a year ago', reward: 'One-year-ago memory card', rewardBuilt: false },
  { id: 'gem', name: 'Hidden Gem Hunter', icon: 'Gem', target: 3, how: 'Visit places few people have saved', reward: 'Hidden gem tag', rewardBuilt: false, title: 'Gem Hunter', soon: true },
  { id: 'spontaneous', name: 'Spontaneous', icon: 'Zap', target: 3, how: 'Visit within 24 hours of saving', reward: 'Special lightning celebration', rewardBuilt: true, title: 'Spontaneous' },
  { id: 'finally', name: 'Finally!', icon: 'Hourglass', target: 1, how: 'Visit a place saved 6+ months ago', reward: 'Special "years in the making" celebration', rewardBuilt: true },
  { id: 'seasons', name: 'Four Seasons', icon: 'Leaf', target: 4, how: 'Visit places in different seasons', reward: 'Seasonal stamp collection', rewardBuilt: false, title: 'Seasoned' },
  { id: 'photographer', name: 'Photographer', icon: 'Camera', target: 10, how: 'Add photos to places', reward: 'Photo collage on your profile', rewardBuilt: false, title: 'Photographer' },
  { id: 'reviewer', name: 'Reviewer', icon: 'MessageSquare', target: 5, how: 'Write reviews', reward: 'Reviews highlighted to your partner', rewardBuilt: false, title: 'Critic' },
];

// Ten frames: seven earned with a badge, three seasonal ones free for everyone in season.
// `months` is [first, last], 1 to 12; a range that wraps the new year (Sep to Feb) has first > last.
export const FRAMES = [
  { id: 'bronze', name: 'Bronze Compass', badge: 'explorer' },
  { id: 'silver', name: 'Silver City', badge: 'local' },
  { id: 'pin', name: 'Pin Border', badge: 'curator' },
  { id: 'gold', name: 'Gold Passport', badge: 'globetrotter', glyph: ['★', [180]] },
  { id: 'couple', name: 'Matching Couple', badge: 'planner' },
  { id: 'hearts', name: 'Double Heart', badge: 'insync', glyph: ['♥', [45, 225]] },
  { id: 'rainbow', name: 'Animated Rainbow', badge: 'reelmaster' },
  { id: 'blossom', name: 'Blossom', months: [3, 5], season: 'Mar to May', glyph: ['✿', [0, 72, 144, 216, 288]] },
  { id: 'sunny', name: 'Sunny', months: [6, 8], season: 'Jun to Aug', glyph: ['☀', [45, 225]] },
  { id: 'cosy', name: 'Cosy', months: [9, 2], season: 'Sep to Feb', glyph: ['❄', [315, 135, 225]] },
];

export const BASE_TITLE = 'Wanderer';

export const badgeById = (id) => BADGES.find((b) => b.id === id);
export const frameById = (id) => FRAMES.find((f) => f.id === id);

export function inSeason(frame, date = new Date()) {
  if (!frame.months) return false;
  const month = date.getMonth() + 1;
  const [first, last] = frame.months;
  return first <= last ? month >= first && month <= last : month >= first || month <= last;
}

// A frame can be worn when its badge is earned, or when it is a seasonal frame and the season is on.
export function frameUnlocked(frame, earnedIds, date = new Date()) {
  if (frame.months) return inSeason(frame, date);
  return earnedIds.has(frame.badge);
}

export function earnedTitles(earnedIds) {
  const titles = [BASE_TITLE];
  for (const badge of BADGES) {
    if (earnedIds.has(badge.id) && badge.title && !titles.includes(badge.title)) titles.push(badge.title);
  }
  return titles;
}

function seasonOf(date) {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

// Counts for every badge that can be worked out today. `places` has one entry per collection a place is in.
export function computeProgress({ places = [], collections = [], profile = null, userId = null, now = new Date() }) {
  const membersOf = new Map(collections.map((c) => [c.id, c.members ?? []]));
  const done = places.filter((p) => p.booking?.done_at);
  const withGap = (p) => new Date(p.booking.done_at) - new Date(p.added_at ?? p.booking.done_at);

  const seasons = new Set(done.map((p) => seasonOf(new Date(p.booking.done_at))));

  // Reviews are per venue; count each of mine once, however many collections the venue is in.
  const mine = new Map();
  for (const p of places) {
    const review = (p.reviews ?? []).find((r) => r.user_id === userId);
    if (review) mine.set(p.location_id ?? p.venue_id ?? p.id, review);
  }
  const reviews = [...mine.values()];

  const together = (p) => (membersOf.get(p.collection_id)?.length ?? 0) > 1;
  const keenTogether = places.filter((p) => {
    const members = membersOf.get(p.collection_id) ?? [];
    return members.length > 1 && members.every((m) => p.reactions?.[m.id] === 'keen');
  });

  return {
    explorer: done.length,
    curator: new Set(places.map((p) => p.id)).size,
    planner: places.filter((p) => p.booking?.planned_at).length,
    foodie: done.filter((p) => FOOD.has(p.category)).length,
    insync: keenTogether.length,
    streak: profile?.best_streak ?? 0,
    first: done.some(together) ? 1 : 0,
    year: done.some((p) => now - new Date(p.booking.done_at) >= 365 * DAY) ? 1 : 0,
    spontaneous: done.filter((p) => p.added_at && withGap(p) <= DAY).length,
    finally: done.some((p) => p.added_at && withGap(p) >= 182 * DAY) ? 1 : 0,
    seasons: seasons.size,
    photographer: reviews.reduce((sum, r) => sum + (r.photos?.length ?? 0), 0),
    reviewer: reviews.filter((r) => r.body?.trim()).length,
  };
}

// Each badge with its count, capped at its target, and whether it is earned.
export function badgeStatus(input) {
  const counts = computeProgress(input);
  return BADGES.map((badge) => {
    const count = badge.soon ? 0 : Math.min(counts[badge.id] ?? 0, badge.target);
    return { ...badge, count, earned: !badge.soon && count >= badge.target };
  });
}
