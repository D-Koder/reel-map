import test from 'node:test';
import assert from 'node:assert/strict';
import { firstView } from './firstView.js';

test('a new visitor sees the landing page', () => {
  assert.equal(firstView({ search: '' }), 'landing');
});

test('an invite goes to sign-up, from the link or from a remembered one', () => {
  assert.equal(firstView({ search: '?invite=abc' }), 'signup');
  assert.equal(firstView({ search: '', invited: true }), 'signup');
});

test('a shared place goes to log in so it can be saved', () => {
  assert.equal(firstView({ search: '', sharedPlace: true }), 'login');
});

test('a device that has signed in before goes straight to log in', () => {
  assert.equal(firstView({ search: '', knownDevice: true }), 'login');
});

test('an invite beats a known device, and a link can pick a screen directly', () => {
  assert.equal(firstView({ search: '', invited: true, knownDevice: true }), 'signup');
  assert.equal(firstView({ search: '?demo=1', knownDevice: true }), 'demo');
  assert.equal(firstView({ search: '?signup=1' }), 'signup');
  assert.equal(firstView({ search: '?login=1' }), 'login');
});
