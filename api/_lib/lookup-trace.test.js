// Run with: npm run test:traces
const test = require('node:test');
const assert = require('node:assert/strict');
const { entryFor, buildTraceRow, isUuid } = require('./lookup-trace');

const ID = '3f0c2b8e-6d1a-4c57-9b3e-2a7f1d8e5c10';
const ORIGIN = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

test('a lookup is tagged by how it arrived', () => {
  assert.equal(entryFor({ background: true, from: 'inbox' }), 'shortcut');
  assert.equal(entryFor({ from: 'inbox' }), 'inbox');
  assert.equal(entryFor({}), 'app');
  assert.equal(entryFor({ background: 'true' }), 'app', 'only a real true counts as the Shortcut');
});

test('ids are checked as UUIDs', () => {
  assert.equal(isUuid(ID), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(undefined), false);
});

test('a trace keeps the AI reply, the earlier reply, the candidates and the pick', () => {
  const candidates = Array.from({ length: 25 }, (_, i) => ({ name: `Place ${i}`, address: `${i} Road`, category: 'cafe', url: `https://maps/${i}` }));
  const row = buildTraceRow({
    id: ID, userId: ID, entry: 'app', reelUrl: 'https://www.instagram.com/reel/abc/?igsh=x', cleanUrl: 'https://www.instagram.com/reel/abc/',
    notes: {
      ai: { model: 'claude-haiku-5-5', raw: '{"places":[]}', earlierRaw: '{"places":[{"name":"First"}]}', answer: { kind: 'venue' } },
      pick: { by: 'app', reason: 'the only result' },
      cache: { hit: false, originTraceId: null },
      cacheKey: 'abc',
    },
    body: {
      caption: 'Lunch at Place 1', creator: 'someone', locationTag: 'Glen Waverley',
      steps: { source: 'Instagram', saved: 'yes', postDate: '2026-11-01' },
      maps: { query: 'Place 1 Glen Waverley', candidates, selectedCandidate: candidates[1], details: { name: 'Place 1' } },
      placeName: 'Place 1',
    },
    logs: 'line one',
  });
  assert.equal(row.entry, 'app');
  assert.equal(row.user_id, ID);
  assert.equal(row.clean_url, 'https://www.instagram.com/reel/abc/');
  assert.equal(row.ai.model, 'claude-haiku-5-5');
  assert.equal(row.ai.raw, '{"places":[]}');
  assert.equal(row.ai.earlierRaw, '{"places":[{"name":"First"}]}');
  assert.equal(row.search.candidates.length, 20, 'candidates are capped');
  assert.deepEqual(Object.keys(row.search.candidates[0]).sort(), ['address', 'category', 'name', 'url']);
  assert.deepEqual(row.search.pick, { by: 'app', reason: 'the only result' });
  assert.equal(row.search.selected.name, 'Place 1');
  assert.equal(row.result.ok, true);
  assert.equal(row.result.saved, 'yes');
  assert.equal(row.result.details.name, 'Place 1');
  assert.equal(row.logs, 'line one');
  assert.deepEqual(row.reports, []);
});

test('a saved-answer lookup points at the lookup that saved it, and only a real id counts', () => {
  const hit = buildTraceRow({ id: ID, entry: 'app', notes: { cache: { hit: true, originTraceId: ORIGIN }, cacheKey: 'k' }, body: {} });
  assert.equal(hit.from_cache, true);
  assert.equal(hit.origin_trace_id, ORIGIN);
  const bad = buildTraceRow({ id: ID, entry: 'app', notes: { cache: { hit: true, originTraceId: 'nope' } }, body: {} });
  assert.equal(bad.origin_trace_id, null);
  assert.equal(bad.user_id, null, 'no user when none is signed in');
});

test('a failed lookup is marked failed and keeps its error', () => {
  const row = buildTraceRow({ id: ID, entry: 'shortcut', body: { maps: { success: false, error: 'Google Maps search failed' } }, error: 'boom' });
  assert.equal(row.result.ok, false);
  assert.equal(row.result.error, 'boom');
  assert.equal(row.search.error, 'Google Maps search failed');
});

test('long text is cut to its limit', () => {
  const row = buildTraceRow({ id: ID, entry: 'app', notes: { ai: { raw: 'x'.repeat(30000) } }, body: { caption: 'c'.repeat(12000) } });
  assert.equal(row.ai.raw.length, 20000);
  assert.equal(row.caption.length, 10000);
});

test('a row with nothing in it still builds', () => {
  const row = buildTraceRow({ id: ID, entry: 'app' });
  assert.equal(row.ai, null);
  assert.deepEqual(row.search.candidates, []);
  assert.equal(row.result.ok, true);
});
