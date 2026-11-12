import test from 'node:test';
import assert from 'node:assert/strict';
import { startPlan } from './startPlan.js';

const handoff = { collName: 'Date night', collEmoji: '🍷' };

test('a new account with no demo gets the full tour', () => {
  assert.deepEqual(startPlan({ joinedByInvite: false, handoff: null, collections: [], userId: 'u1' }), { variant: 'main', collName: null, create: false, clear: false });
});

test('a new account that did the demo gets the short tour and its collection is made', () => {
  const plan = startPlan({ joinedByInvite: false, handoff, collections: [{ name: 'TBD', ownerId: 'u1' }], userId: 'u1' });
  assert.deepEqual(plan, { variant: 'demo', collName: 'Date night', create: true, clear: false });
});

test('the collection is made only once, even if the plan is asked for again', () => {
  const plan = startPlan({ joinedByInvite: false, handoff, collections: [], userId: 'u1', creating: true });
  assert.equal(plan.create, false);
  assert.equal(plan.variant, 'demo');
});

test('if the collection already exists it is not made again, and the hand-off is cleared', () => {
  const plan = startPlan({ joinedByInvite: false, handoff, collections: [{ name: 'Date night', ownerId: 'u1' }], userId: 'u1' });
  assert.deepEqual(plan, { variant: 'demo', collName: 'Date night', create: false, clear: true });
});

test('a collection with that name that belongs to someone else does not count', () => {
  const plan = startPlan({ joinedByInvite: false, handoff, collections: [{ name: 'Date night', ownerId: 'someone-else' }], userId: 'u1' });
  assert.equal(plan.create, true);
});

test('joining by invite wins: the partner tour, and the demo hand-off is dropped', () => {
  assert.deepEqual(startPlan({ joinedByInvite: true, handoff, collections: [], userId: 'u1' }), { variant: 'partner', collName: null, create: false, clear: true });
  assert.equal(startPlan({ joinedByInvite: true, handoff: null, collections: [], userId: 'u1' }).clear, false);
});
