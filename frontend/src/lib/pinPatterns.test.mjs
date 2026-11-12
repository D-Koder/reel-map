// Run with: node --test frontend/src/lib/pinPatterns.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIN_PATTERNS, patternById, patternTile } from './pinPatterns.js';

test('the eight chosen patterns are here, in three groups', () => {
  assert.deepEqual(PIN_PATTERNS.map((p) => p.id), ['cat', 'paw', 'heart', 'flower', 'star', 'leaf', 'wave', 'checks']);
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

test('unknown ids give nothing', () => {
  assert.equal(patternById('nope'), null);
  assert.equal(patternTile('nope'), null);
});
