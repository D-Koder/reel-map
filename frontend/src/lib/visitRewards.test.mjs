import test from 'node:test';
import assert from 'node:assert/strict';
import { visitRewards } from './visitRewards.js';

const day = (n) => new Date(Date.UTC(2026, 10, 12) - n * 86400000).toISOString();
const solo = { id: 'c1', members: [{ id: 'me' }] };
const pair = { id: 'c1', members: [{ id: 'me' }, { id: 'you' }] };
const place = (id, extra = {}) => ({ id, collection_id: 'c1', category: 'food', added_at: day(40), reactions: {}, reviews: [], booking: null, ...extra });
const done = (id, extra = {}) => place(id, { booking: { done_at: day(0) }, ...extra });
const review = (body, photos = []) => [{ user_id: 'me', body, photos }];
const run = (places, collections = [solo], placeId = 'p') => visitRewards({ places, collections, userId: 'me', placeId, now: new Date(Date.UTC(2026, 10, 12)) });

test('marking a place done is worth 20 XP, and nothing else', () => {
  const r = run([done('p')]);
  assert.deepEqual(r.parts, [{ label: 'Place done', value: 20 }]);
  assert.equal(r.together, false);
  assert.equal(r.total, 20);
});

test('a review of 20+ letters adds 20, photos add 5 each up to three', () => {
  const r = run([done('p', { reviews: review('The broth was unreal and the dumplings were crispy.', ['a', 'b', 'c', 'd']) })]);
  assert.deepEqual(r.parts.map((p) => p.label), ['Place done', 'Review', '3 photos']);
  assert.deepEqual(r.parts.map((p) => p.value), [20, 20, 15]);
  assert.equal(r.total, 55);
  // A short note counts for nothing.
  assert.deepEqual(run([done('p', { reviews: review('nice') })]).parts.map((p) => p.label), ['Place done']);
  assert.equal(run([done('p', { reviews: review('', ['a']) })]).parts.at(-1).label, '1 photo');
});

test('going with a friend multiplies everything by 1.5, and the total is the sum times that', () => {
  const r = run([done('p', { reviews: review('The broth was unreal and the dumplings were crispy.', ['a', 'b']) })], [pair]);
  assert.equal(r.together, true);
  assert.equal(r.total, Math.round((20 + 20 + 10) * 1.5));
});

test('every completed booking earns something: a sixth place the same day is worth 5 instead of 20', () => {
  const today = (n) => Array.from({ length: n }, (_, i) => done(`p${i}`, { booking: { done_at: day(0) } }));
  assert.equal(run(today(5), [solo], 'p4').total, 20);
  const sixth = run(today(6), [solo], 'p5');
  assert.equal(sixth.total, 5);
  assert.deepEqual(sixth.parts, [{ label: 'Place done', value: 5 }]);
});

test('nothing to show for a place that is not done, or that is not there', () => {
  assert.equal(run([place('p')]), null);
  assert.equal(run([done('other')]), null);
});

test('badge progress: only what moved, capped at the goal, with a flag for the one that was just earned', () => {
  const four = [1, 2, 3, 4].map((i) => done(`d${i}`, { booking: { done_at: day(i + 1) } }));
  const r = run([...four, done('p')]);
  const explorer = r.badges.find((b) => b.id === 'explorer');
  assert.deepEqual({ from: explorer.from, to: explorer.to, target: explorer.target, earned: explorer.earned }, { from: 4, to: 5, target: 5, earned: true });
  const foodie = r.badges.find((b) => b.id === 'foodie');
  assert.deepEqual({ from: foodie.from, to: foodie.to, earned: foodie.earned }, { from: 4, to: 5, earned: false });
  // Badges that need data the app does not have are never listed.
  assert.ok(!r.badges.some((b) => b.soon));
  assert.equal(r.earnedCount, 1);
});

test('a place that is not food does not move Foodie, and a review moves Reviewer', () => {
  const r = run([done('p', { category: 'activity', reviews: review('The broth was unreal and the dumplings were crispy.') })]);
  assert.ok(!r.badges.some((b) => b.id === 'foodie'));
  assert.ok(r.badges.some((b) => b.id === 'reviewer'));
});
