import test from 'node:test';
import assert from 'node:assert/strict';
import { addClaim, cleanClaims, mergeClaims } from './claims.js';

test('a new device with nothing of its own shows what the account has claimed', () => {
  const m = mergeClaims({ badges: ['a', 'b'], prizes: [1, 2] }, {});
  assert.deepEqual([m.badges, m.prizes, m.changed], [['a', 'b'], [1, 2], false]);
});

test('claims made on this device before they moved to the account are copied up, nothing is lost', () => {
  const m = mergeClaims({ badges: ['a'], prizes: [1] }, { claimed: ['b', 'a'], prizes: [2, 1] });
  assert.deepEqual([m.badges, m.prizes, m.changed], [['a', 'b'], [1, 2], true]);
});

test('"seen" is the old name for claimed badges', () => {
  assert.deepEqual(mergeClaims({}, { seen: ['x'] }).badges, ['x']);
});

test('a brand-new account with an empty device changes nothing', () => {
  assert.equal(mergeClaims(null, {}).changed, false);
  assert.equal(mergeClaims(undefined, undefined).changed, false);
});

test('junk is dropped', () => {
  assert.deepEqual(cleanClaims({ badges: ['a', 5, '', null, 'a'], prizes: [2, 'x', 1.5, 2, -1] }), { badges: ['a'], prizes: [2] });
  assert.deepEqual(cleanClaims('nope'), { badges: [], prizes: [] });
});

test('claiming adds one badge or prize and never removes any', () => {
  assert.deepEqual(addClaim({ badges: ['a'], prizes: [1] }, { badge: 'b' }), { badges: ['a', 'b'], prizes: [1] });
  assert.deepEqual(addClaim({ badges: ['a'], prizes: [1] }, { prize: 3 }), { badges: ['a'], prizes: [1, 3] });
  assert.deepEqual(addClaim(null, { badge: 'a' }), { badges: ['a'], prizes: [] });
});
