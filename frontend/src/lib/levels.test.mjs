// Run with: node --test frontend/src/lib/levels.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_XP, MAX_LEVEL, PRIZES, XP, computeActionXp, levelInfo, prizeAt, prizesBetween, totalXp } from './levels.js';
import { FRAMES, earnedTitles, frameById, frameUnlocked } from './achievements.js';
import { PIN_PATTERNS } from './pinPatterns.js';

const collections = [{ id: 'together', members: [{ id: 'me' }, { id: 'sam' }] }, { id: 'solo', members: [{ id: 'me' }] }];
const done = (id, collection_id, when, extra = {}) => ({ id, collection_id, booking: { done_at: when }, reviews: [], ...extra });
const xp = (places) => computeActionXp({ places, collections, userId: 'me' }).total;

test('25 levels, each costing more than the last, matching the plan', () => {
  assert.equal(MAX_LEVEL, 25);
  assert.equal(LEVEL_XP[0], 0);
  const costs = LEVEL_XP.slice(1).map((x, i) => x - LEVEL_XP[i]);
  assert.ok(costs.every((c, i) => i === 0 || c >= costs[i - 1]));
  assert.deepEqual([LEVEL_XP[1], LEVEL_XP[4], LEVEL_XP[6], LEVEL_XP[12], LEVEL_XP[19], LEVEL_XP[24]], [50, 230, 400, 1150, 2655, 4180]);
});

test('levelInfo finds the level, progress and what is left', () => {
  assert.deepEqual(levelInfo(0), { level: 1, max: false, xp: 0, cur: 0, size: 50, left: 50, pct: 0 });
  assert.equal(levelInfo(49).level, 1);
  assert.equal(levelInfo(50).level, 2);
  assert.equal(levelInfo(120).left, 40);
  const top = levelInfo(9999);
  assert.equal(top.level, 25);
  assert.ok(top.max && top.left === 0 && top.pct === 100);
});

test('prizes sit at levels 1, 2, 5, 7, 13, 20 and 25, and the crossed ones are found', () => {
  assert.deepEqual(PRIZES.map((p) => p.level), [1, 2, 5, 7, 13, 20, 25]);
  assert.deepEqual(prizesBetween(3, 8).map((p) => p.level), [5, 7]);
  assert.deepEqual(prizesBetween(7, 7), []);
  assert.equal(prizeAt(25).frame, 'laurel');
});

test('a visit is 20, a friend makes it 30, a review and photos add up', () => {
  assert.equal(xp([done('a', 'solo', '2026-11-01T12:00:00Z')]), 20 + XP.save);
  assert.equal(xp([done('a', 'together', '2026-11-01T12:00:00Z')]), 30 + XP.save);
  const review = { user_id: 'me', body: 'x'.repeat(25), photos: [1, 2, 3, 4] };
  assert.equal(xp([done('a', 'solo', '2026-11-01T12:00:00Z', { reviews: [review] })]), 20 + 20 + 15 + XP.save);
  assert.equal(xp([done('a', 'together', '2026-11-01T12:00:00Z', { reviews: [review] })]), 83 + XP.save);
});

test('a short review earns no review XP, and only my review counts', () => {
  const short = { user_id: 'me', body: 'nice', photos: [] };
  const theirs = { user_id: 'sam', body: 'x'.repeat(40), photos: [] };
  assert.equal(xp([done('a', 'solo', '2026-11-01T12:00:00Z', { reviews: [short, theirs] })]), 20 + XP.save);
});

test('a place in two collections counts once, and shared wins', () => {
  const places = [done('a', 'solo', '2026-11-01T12:00:00Z'), done('a', 'together', '2026-11-01T12:00:00Z')];
  assert.equal(xp(places), 30 + XP.save);
});

test('only five places a day earn visit XP, and saves still count', () => {
  const same = Array.from({ length: 7 }, (_, i) => done(`p${i}`, 'solo', '2026-11-01T12:00:00Z'));
  assert.equal(computeActionXp({ places: same, collections, userId: 'me' }).visits, 5 * 20);
  assert.equal(xp(same), 100 + 7 * XP.save);
});

test('a saved place that is not done earns only the save', () => {
  assert.equal(xp([{ id: 'a', collection_id: 'solo', booking: null, reviews: [] }]), XP.save);
});

test('claims add 100 a badge and 50 a prize', () => {
  assert.equal(totalXp({ places: [], collections, userId: 'me' }, 2, 3), 200 + 150);
});

test('prize titles, the laurel frame and every texture unlock from claimed prizes', () => {
  const none = new Set();
  assert.deepEqual(earnedTitles(none, {}), ['Wanderer']);
  assert.ok(earnedTitles(new Set(['prize:7', 'prize:20', 'prize:25']), {}).includes('Map Maker'));
  assert.ok(earnedTitles(new Set(['prize:7']), {}).includes('Adventurer'));
  assert.ok(!earnedTitles(new Set(['prize:7']), {}).includes('Cartographer'));
  assert.equal(frameUnlocked(frameById('laurel'), none), false);
  assert.equal(frameUnlocked(frameById('laurel'), new Set(['prize:25'])), true);
  const titles = earnedTitles(new Set(['prize:7', 'prize:20', 'prize:25']), {});
  assert.equal(new Set(titles).size, titles.length);
  // every pattern a prize names exists, and every prize pattern is unlocked by that prize
  for (const prize of PRIZES) for (const id of prize.patterns ?? []) assert.equal(PIN_PATTERNS.find((p) => p.id === id)?.unlock.prize, prize.level);
  assert.equal(FRAMES.filter((f) => f.prize).length, 1);
});
