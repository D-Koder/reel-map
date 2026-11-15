import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTab, firstReady, nextUpBadges } from './achievementsView.js';

const b = (id, count, target, st = 'todo') => ({ id, count, target, st });

test('next up: the badges closest to done, highest share first, three at most', () => {
  const list = [b('a', 1, 10), b('b', 18, 25), b('c', 2, 3), b('d', 3, 5), b('e', 0, 4)];
  assert.deepEqual(nextUpBadges(list).map((x) => x.id), ['b', 'c', 'd']);
  assert.deepEqual(nextUpBadges(list, 5).map((x) => x.id), ['b', 'c', 'd', 'a', 'e']);
});

test('next up skips coming-soon, ready and claimed badges', () => {
  const list = [b('soon', 0, 3, 'soon'), b('ready', 5, 5, 'ready'), b('done', 5, 5, 'done'), b('todo', 1, 5)];
  assert.deepEqual(nextUpBadges(list).map((x) => x.id), ['todo']);
  assert.deepEqual(nextUpBadges([]), []);
});

test('the screen opens on rewards when something is ready, else on quests until they are done, else on badges', () => {
  assert.equal(defaultTab({ ready: 1, questsComplete: false }), 'rewards');
  assert.equal(defaultTab({ ready: 0, questsComplete: false }), 'quests');
  assert.equal(defaultTab({ ready: 0, questsComplete: true }), 'badges');
  assert.equal(defaultTab({ ready: 2, questsComplete: true }), 'rewards');
});

test('the first ready reward is a badge before a prize, and says which tab it lives on', () => {
  assert.deepEqual(firstReady({ readyBadges: [{ id: 'x' }], readyPrizes: [{ level: 2 }] }), { kind: 'badge', id: 'x', tab: 'badges' });
  assert.deepEqual(firstReady({ readyBadges: [], readyPrizes: [{ level: 2 }, { level: 5 }] }), { kind: 'prize', id: 2, tab: 'rewards' });
  assert.equal(firstReady({ readyBadges: [], readyPrizes: [] }), null);
});
