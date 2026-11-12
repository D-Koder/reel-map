// Run with: node --test frontend/src/lib/achievements.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, FRAMES, badgeStatus, earnedTitles, frameUnlocked, inSeason, frameById } from './achievements.js';

const day = (n) => new Date(Date.UTC(2026, 10, 12) - n * 86400000).toISOString();
const collections = [{ id: 'c1', members: [{ id: 'me' }, { id: 'sam' }] }, { id: 'c2', members: [{ id: 'me' }] }];
const place = (id, extra = {}) => ({ id, collection_id: 'c1', category: 'food', added_at: day(40), reactions: {}, reviews: [], booking: null, ...extra });
const now = new Date(Date.UTC(2026, 10, 12));
const status = (places, profile = {}) => Object.fromEntries(badgeStatus({ places, collections, profile, userId: 'me', now }).map((b) => [b.id, b]));

test('there are 18 badges and 10 frames, as designed', () => {
  assert.equal(BADGES.length, 18);
  assert.equal(FRAMES.length, 10);
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

test('titles start with Wanderer and add one per earned badge', () => {
  assert.deepEqual(earnedTitles(new Set()), ['Wanderer']);
  assert.deepEqual(earnedTitles(new Set(['explorer', 'streak'])), ['Wanderer', 'Explorer', 'Dream Team']);
});
