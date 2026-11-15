// Run with: node --test frontend/src/lib/achievements.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, FRAMES, FUN_TITLES, TITLE_LADDERS, badgeStatus, computeProgress, demoCelebrationPending, earnedTitles, frameLockLabel, frameUnlocked, funTitles, inSeason, frameById, titleLadders } from './achievements.js';

const day = (n) => new Date(Date.UTC(2026, 10, 12) - n * 86400000).toISOString();
const collections = [{ id: 'c1', members: [{ id: 'me' }, { id: 'sam' }] }, { id: 'c2', members: [{ id: 'me' }] }];
const place = (id, extra = {}) => ({ id, collection_id: 'c1', category: 'food', added_at: day(40), reactions: {}, reviews: [], booking: null, ...extra });
const now = new Date(Date.UTC(2026, 10, 12));
const status = (places, profile = {}) => Object.fromEntries(badgeStatus({ places, collections, profile, userId: 'me', now }).map((b) => [b.id, b]));

test('there are 19 badges and 12 frames, as designed', () => {
  assert.equal(BADGES.length, 19);
  assert.equal(FRAMES.length, 12);
  assert.equal(FRAMES.filter((f) => f.months).length, 3);
});

test('every frame badge and every badge frame exists, and no title is shared', () => {
  for (const f of FRAMES.filter((x) => x.badge)) assert.ok(BADGES.some((b) => b.id === f.badge));
  for (const b of BADGES.filter((x) => x.frame)) assert.ok(frameById(b.frame));
  const titles = BADGES.map((b) => b.title).filter(Boolean);
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(BADGES.find((b) => b.id === 'streak').title, 'Dream Team');
  assert.notEqual(BADGES.find((b) => b.id === 'insync').title, 'Dream Team');
});

test('explorer earns at 5 done places and caps there', () => {
  const places = Array.from({ length: 7 }, (_, i) => place(i, { booking: { done_at: day(i + 1) } }));
  assert.equal(status(places.slice(0, 4)).explorer.earned, false);
  assert.equal(status(places.slice(0, 4)).explorer.count, 4);
  assert.equal(status(places).explorer.earned, true);
  assert.equal(status(places).explorer.count, 5);
});

test('spontaneous, finally, year and first date night', () => {
  const quick = place(1, { added_at: day(1.5), booking: { done_at: day(1) } });
  assert.equal(status([quick]).spontaneous.count, 1);
  const old = place(2, { added_at: day(600), booking: { done_at: day(380) } });
  const s = status([old]);
  assert.equal(s.finally.earned, true);
  assert.equal(s.year.earned, true);
  assert.equal(s.first.earned, true);
  const solo = place(3, { collection_id: 'c2', booking: { done_at: day(2) } });
  assert.equal(status([solo]).first.earned, false);
});

test('in sync needs everyone in the collection to be keen', () => {
  const both = place(1, { reactions: { me: 'keen', sam: 'keen' } });
  const half = place(2, { reactions: { me: 'keen', sam: 'maybe' } });
  assert.equal(status([both, half]).insync.count, 1);
});

test('reviews and photos count once per venue', () => {
  const review = { user_id: 'me', body: 'Great', photos: ['a', 'b'] };
  const a = place(1, { location_id: 'L1', reviews: [review] });
  const b = place(1, { location_id: 'L1', collection_id: 'c2', reviews: [review] });
  const s = status([a, b]);
  assert.equal(s.reviewer.count, 1);
  assert.equal(s.photographer.count, 2);
});

test('soon badges never earn', () => {
  const s = status([]);
  for (const id of ['local', 'globetrotter', 'reelmaster', 'regular', 'gem']) assert.equal(s[id].earned, false);
});

test('seasonal frames follow the date, including Sep to Feb wrapping the new year', () => {
  const cosy = frameById('cosy');
  assert.equal(inSeason(cosy, new Date(2026, 10, 12)), true);
  assert.equal(inSeason(cosy, new Date(2027, 0, 5)), true);
  assert.equal(inSeason(cosy, new Date(2026, 6, 1)), false);
  assert.equal(frameUnlocked(frameById('bronze'), new Set()), false);
  assert.equal(frameUnlocked(frameById('bronze'), new Set(['explorer'])), true);
});

const allTitles = () => [
  ...TITLE_LADDERS.flatMap((l) => l.tiers.map(([t]) => t)),
  ...FUN_TITLES.map((f) => f.title),
  ...BADGES.map((b) => b.title).filter(Boolean),
];

test('no title can be earned two ways', () => {
  const titles = allTitles();
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(!TITLE_LADDERS.find((l) => l.id === 'couple').tiers.some(([t]) => t === 'Dream Team'));
});

test('titles start with Wanderer; badges and ladders add more', () => {
  assert.deepEqual(earnedTitles(new Set()), ['Wanderer']);
  assert.deepEqual(earnedTitles(new Set(['explorer', 'streak'])), ['Wanderer', 'Dream Team']);
  const titles = earnedTitles(new Set(), { placesDone: 15, foodDone: 5, togetherDone: 1 });
  for (const t of ['Wanderer', 'Explorer', 'Trailblazer', 'Foodie', 'Snacker', 'Plus-One']) assert.ok(titles.includes(t), t);
  assert.ok(!titles.includes('Pathfinder') && !titles.includes('Gourmet'));
});

test('ladders report the next rung and skip ones that are coming soon', () => {
  const explorer = titleLadders({ placesDone: 7 }).find((l) => l.id === 'explorer');
  assert.deepEqual(explorer.tiers.filter((t) => t.earned).map((t) => t.title), ['Wanderer', 'Explorer']);
  assert.equal(explorer.next.title, 'Trailblazer');
  const city = titleLadders({ cityBest: 99 }).find((l) => l.id === 'city');
  assert.equal(city.tiers.some((t) => t.earned), false);
  assert.equal(funTitles({ brunch: 9 }).find((f) => f.title === 'Brunch Boss').earned, false);
});

test('ladders count each place once, and night owl / early bird use the hour it was done', () => {
  const at = (h) => new Date(2026, 5, 10, h, 30).toISOString();
  const mk = (id, h, extra = {}) => ({ id, collection_id: 'c1', category: 'food', added_at: at(1), reactions: {}, reviews: [], booking: { done_at: at(h) }, ...extra });
  const places = [mk(1, 22), mk(1, 22, { collection_id: 'c2' }), mk(2, 7), mk(3, 13, { category: 'fun' })];
  const c = computeProgress({ places, collections, profile: {}, userId: 'me', now });
  assert.equal(c.placesDone, 3);
  assert.equal(c.foodDone, 2);
  assert.equal(c.nightOwl, 1);
  assert.equal(c.earlyBird, 1);
  assert.equal(c.togetherDone, 3);
});

test('finishing the demo earns Test Driver and its title', () => {
  assert.equal(badgeStatus({ demoDone: false }).find((b) => b.id === 'demo').earned, false);
  assert.equal(badgeStatus({ demoDone: true }).find((b) => b.id === 'demo').earned, true);
  assert.ok(earnedTitles(new Set(['demo'])).includes('Test Driver'));
});

test('every frame says what it needs, including the Level 25 prize frame (it once crashed Customise profile)', () => {
  for (const f of FRAMES) assert.ok(frameLockLabel(f), `${f.id} needs a lock label`);
  assert.equal(frameLockLabel(frameById('laurel')), 'Level 25');
  assert.equal(frameLockLabel(frameById('bronze')), 'Explorer');
  assert.equal(frameLockLabel(frameById('sunny')), 'Jun to Aug');
});

test('the first-run tour waits for the Test Driver celebration, but never for ever', () => {
  const base = { ready: true, accountBadge: true, demoBadge: null, deviceDone: false, isNewAccount: true, graceOver: false, demoReady: false };
  // Nothing to celebrate: the tour goes ahead.
  assert.equal(demoCelebrationPending(base), false);
  // Not loaded yet: no hold.
  assert.equal(demoCelebrationPending({ ...base, ready: false, demoBadge: 'earned' }), false);
  // Earned on the account (email sign-up): hold until it is claimed.
  assert.equal(demoCelebrationPending({ ...base, demoBadge: 'earned' }), true);
  assert.equal(demoCelebrationPending({ ...base, demoBadge: 'claimed' }), false);
  // Google sign-up: the demo was finished on this device and the mark is being saved. Held briefly, then let go.
  assert.equal(demoCelebrationPending({ ...base, deviceDone: true }), true);
  assert.equal(demoCelebrationPending({ ...base, deviceDone: true, graceOver: true }), false);
  // An older account that finished the demo on this device earns nothing, so nothing is held.
  assert.equal(demoCelebrationPending({ ...base, deviceDone: true, isNewAccount: false }), false);
  // No database column yet: the device decides.
  assert.equal(demoCelebrationPending({ ...base, accountBadge: false, deviceDone: true }), true);
  assert.equal(demoCelebrationPending({ ...base, accountBadge: false, demoReady: true, graceOver: true }), true);
  assert.equal(demoCelebrationPending({ ...base, accountBadge: false }), false);
});

test('First Light is a free frame: anyone can wear it, and Test Driver shows it as part of its reward', () => {
  const glow = frameById('glow');
  assert.equal(glow.name, 'First Light');
  assert.equal(glow.free, true);
  // No badge, no season, no level needed.
  assert.equal(frameUnlocked(glow, new Set()), true);
  assert.equal(frameUnlocked(glow, new Set(), new Date(Date.UTC(2026, 6, 1))), true);
  assert.equal(frameLockLabel(glow), 'Free');
  assert.equal(BADGES.find((b) => b.id === 'demo').frame, 'glow');
  // The other frames still need what they needed.
  assert.equal(frameUnlocked(frameById('bronze'), new Set()), false);
  assert.equal(frameUnlocked(frameById('laurel'), new Set()), false);
});

test('a new account can wear First Light from the start (the saved frame is kept, not dropped)', () => {
  const none = new Set();
  const wearable = FRAMES.filter((f) => frameUnlocked(f, none, new Date(Date.UTC(2026, 6, 1)))).map((f) => f.id);
  // In July only the free frame and the summer frame are open to someone with nothing earned.
  assert.deepEqual(wearable.sort(), ['glow', 'sunny']);
});
