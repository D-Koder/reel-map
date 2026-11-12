// Run with: node --test frontend/src/lib/pinPatterns.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIN_PATTERNS, patternById, patternTile, patternUnlocked } from './pinPatterns.js';

test('thirteen patterns, in three groups, each with a badge or a level that unlocks it', () => {
  assert.deepEqual(PIN_PATTERNS.map((p) => p.id), ['cat', 'heart', 'flower', 'star', 'leaf', 'wave', 'cloud', 'dots', 'bolt', 'moon', 'flame', 'diamond', 'stripes']);
  assert.ok(PIN_PATTERNS.every((p) => p.unlock?.badge || p.unlock?.prize));
  assert.deepEqual([...new Set(PIN_PATTERNS.map((p) => p.group))], ['Cute', 'Cool', 'Neutral']);
});

test('every pattern makes a faded white tile', () => {
  for (const p of PIN_PATTERNS) {
    const tile = patternTile(p.id);
    assert.match(tile, /^url\('data:image\/svg\+xml;utf8,/);
    assert.ok(!tile.slice(5, -2).includes("'"), 'no stray quotes inside the url');
    assert.ok(decodeURIComponent(tile).includes('opacity="0.2"'));
  }
});

test('unknown ids, including the removed paw and checks, give nothing', () => {
  for (const id of ['nope', 'paw', 'checks']) assert.equal(patternById(id), null);
  assert.equal(patternTile('nope'), null);
});

test('Explorer gives three textures, level prizes give the other ten', () => {
  const open = (unlocked) => PIN_PATTERNS.filter((p) => patternUnlocked(p, new Set(unlocked))).map((p) => p.id);
  assert.deepEqual(open([]), []);
  assert.deepEqual(open(['explorer']), ['cat', 'heart', 'leaf']);
  assert.deepEqual(open(['prize:5']), ['star', 'wave']);
  assert.equal(open(['explorer', 'prize:2', 'prize:5', 'prize:7', 'prize:13', 'prize:20']).length, 13);
});
