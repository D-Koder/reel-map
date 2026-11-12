import test from 'node:test';
import assert from 'node:assert/strict';
import { addableFriends, forgetFriendCode, friendCodeFromSearch, friendLink, pendingFriendCode, peopleYouKnow, rememberFriendCode } from './friends.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('a friend link carries a code, and only a plausible one is accepted', () => {
  assert.equal(friendCodeFromSearch('?friend=ABCDEF123456'), 'abcdef123456');
  assert.equal(friendCodeFromSearch('?friend=short'), null);
  assert.equal(friendCodeFromSearch('?friend=<script>alert(1)</script>'), null);
  assert.equal(friendCodeFromSearch(''), null);
  assert.equal(friendLink('https://x.app', 'abc12345'), 'https://x.app?friend=abc12345');
});

test('a friend code is kept until used, and a broken store never throws', () => {
  const store = memory();
  rememberFriendCode('abc12345', store);
  assert.equal(pendingFriendCode(store), 'abc12345');
  forgetFriendCode(store);
  assert.equal(pendingFriendCode(store), null);
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  assert.doesNotThrow(() => rememberFriendCode('x', broken));
  assert.equal(pendingFriendCode(broken), null);
  assert.doesNotThrow(() => forgetFriendCode(broken));
});

test('suggestions are collection-mates with no friendship yet, once each, by name', () => {
  const collections = [
    { members: [{ id: 'me', display_name: 'Me' }, { id: 'b', display_name: 'Bea' }, { id: 'a', display_name: 'Al' }] },
    { members: [{ id: 'b', display_name: 'Bea' }, { id: 'c', display_name: 'Cy' }] },
  ];
  assert.deepEqual(peopleYouKnow(collections, 'me', ['c']).map((p) => p.id), ['a', 'b']);
  assert.deepEqual(peopleYouKnow(undefined, 'me', []), []);
});

test('only accepted friends who are not already in are offered for a collection', () => {
  const friends = [
    { id: 'a', direction: 'friend' }, { id: 'b', direction: 'friend' }, { id: 'c', direction: 'incoming' }, { id: 'd', direction: 'outgoing' },
  ];
  assert.deepEqual(addableFriends(friends, { members: [{ id: 'a' }] }).map((f) => f.id), ['b']);
});
