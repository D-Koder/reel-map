// XP, levels and level prizes. Plain data and pure functions, so it runs the same in the app and in a test.
//
// XP is worked out from what is already saved, never stored, so it cannot drift or be farmed twice:
//   a place marked done  20   (no more than 5 places a day earn it)
//   a review of 20+ letters +20, and +5 for each of up to 3 photos on it
//   a place done with a friend (a shared collection) earns 1.5 times all of the above
//   a place saved         5
// Claiming a badge adds 100 and claiming a level prize adds 50. Those two are kept on the device.
// All the numbers live here, so they are easy to tune after real use.

export const XP = { visit: 20, review: 20, photo: 5, photosMax: 3, together: 1.5, save: 5, badge: 100, prize: 50, visitsPerDay: 5, minReview: 20 };

// Total XP needed to reach each level, 1 to 25. Early levels are cheap, later ones slowly cost more.
export const LEVEL_XP = [0, 50, 100, 160, 230, 310, 400, 500, 610, 730, 860, 1000, 1150, 1320, 1505, 1705, 1920, 2150, 2395, 2655, 2930, 3220, 3525, 3845, 4180];
export const MAX_LEVEL = LEVEL_XP.length;

// What each prize level gives. `patterns` are pin textures, `titles` are profile titles, `frame` is a profile frame.
// A line with soon: true is promised but not built yet, so the app marks it "Coming soon".
export const PRIZES = [
  { level: 1, icon: 'Star', name: 'Level chip', short: 'Lv on your profile', lines: [{ text: 'Level chip on your profile' }] },
  { level: 2, icon: 'Leaf', name: 'Flowers', short: 'pin texture', patterns: ['flower'], lines: [{ text: 'Pin texture: Flowers' }] },
  { level: 5, icon: 'Gift', name: 'Stars + Waves', short: 'textures, celebration style', patterns: ['star', 'wave'], lines: [{ text: 'Pin textures: Stars, Waves' }, { text: 'Pick your celebration style', soon: true }] },
  { level: 7, icon: 'Compass', name: 'Adventurer', short: 'title, Clouds + Dots', patterns: ['cloud', 'dots'], titles: ['Adventurer'], lines: [{ text: 'Title: Adventurer' }, { text: 'Pin textures: Clouds, Dots' }] },
  { level: 13, icon: 'Zap', name: 'Lightning, Moons, Flames', short: 'textures, title shimmer', patterns: ['bolt', 'moon', 'flame'], lines: [{ text: 'Pin textures: Lightning, Moons, Flames' }, { text: 'Title shimmer', soon: true }] },
  { level: 20, icon: 'Gem', name: 'Cartographer', short: 'title, Diamonds + Stripes', patterns: ['diamond', 'stripes'], titles: ['Cartographer'], lines: [{ text: 'Title: Cartographer' }, { text: 'Pin textures: Diamonds, Stripes' }] },
  { level: 25, icon: 'Crown', name: 'Gold Laurel frame', short: 'exclusive frame, Map Maker', frame: 'laurel', titles: ['Map Maker'], lines: [{ text: 'Exclusive frame: Gold Laurel (animated)' }, { text: 'Title: Map Maker' }] },
];

export const prizeAt = (level) => PRIZES.find((p) => p.level === level) ?? null;
export const prizeToken = (level) => `prize:${level}`;

// Where a total sits: the level, how far through it, and how much is left.
export function levelInfo(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i += 1) if (xp >= LEVEL_XP[i]) level = i + 1;
  const max = level === MAX_LEVEL;
  const from = LEVEL_XP[level - 1];
  const to = max ? from : LEVEL_XP[level];
  return { level, max, xp, cur: xp - from, size: max ? 1 : to - from, left: max ? 0 : to - xp, pct: max ? 100 : Math.round(((xp - from) / (to - from)) * 100) };
}

// The prize levels crossed going from one level to another, to celebrate after a level-up.
export const prizesBetween = (from, to) => PRIZES.filter((p) => p.level > from && p.level <= to);

// XP from what is saved: visits, reviews, photos and saves. See the numbers at the top.
export function computeActionXp({ places = [], collections = [], userId = null }) {
  const membersOf = new Map(collections.map((c) => [c.id, c.members ?? []]));
  const shared = (p) => (membersOf.get(p.collection_id)?.length ?? 0) > 1;

  // One entry per place, even when it sits in several collections.
  const unique = new Map();
  for (const p of places) {
    const have = unique.get(p.id);
    if (!have) unique.set(p.id, { place: p, together: shared(p) });
    else {
      have.together = have.together || shared(p);
      if (!have.place.booking?.done_at && p.booking?.done_at) have.place = p;
    }
  }

  const done = [...unique.values()]
    .filter((u) => u.place.booking?.done_at)
    .sort((a, b) => new Date(a.place.booking.done_at) - new Date(b.place.booking.done_at));
  const perDay = new Map();
  let visits = 0;
  for (const { place, together } of done) {
    const day = new Date(place.booking.done_at).toDateString();
    const used = perDay.get(day) ?? 0;
    if (used >= XP.visitsPerDay) continue;
    perDay.set(day, used + 1);
    const review = (place.reviews ?? []).find((r) => r.user_id === userId);
    let value = XP.visit;
    if (review) {
      if ((review.body ?? '').trim().length >= XP.minReview) value += XP.review;
      value += Math.min(review.photos?.length ?? 0, XP.photosMax) * XP.photo;
    }
    visits += Math.round(value * (together ? XP.together : 1));
  }
  const saves = unique.size * XP.save;
  return { visits, saves, total: visits + saves };
}

export function totalXp(input, claimedBadges = 0, claimedPrizes = 0) {
  return computeActionXp(input).total + claimedBadges * XP.badge + claimedPrizes * XP.prize;
}
