// Run with: npm run test:traces
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTrace, summaryLine } from './trace-format.mjs';

const row = {
  id: '3f0c2b8e-6d1a-4c57-9b3e-2a7f1d8e5c10',
  created_at: '2026-11-16T07:50:00Z',
  entry: 'shortcut',
  user_id: null,
  reel_url: 'https://www.instagram.com/reel/abc/',
  from_cache: false,
  steps: { source: 'Instagram', saved: 'yes (the app picked the place by itself)', postDate: '2026-11-01' },
  caption: 'Lunch at Place 1',
  creator: 'someone',
  location_tag: 'Glen Waverley',
  ai: { model: 'claude-haiku-5-5', raw: '{"places":[{"name":"Place 1"}]}', earlierRaw: null, answer: { confidence: 'high', kind: 'venue' } },
  search: {
    query: 'Place 1 Glen Waverley',
    candidates: [{ name: 'Place 1', address: '1 Main St', url: 'https://maps/1' }, { name: 'Other', address: '', url: 'https://maps/2' }],
    selected: { name: 'Place 1', url: 'https://maps/1' },
    pick: { by: 'app', reason: 'the only result' },
  },
  result: { ok: true, placeName: 'Place 1', details: { name: 'Place 1', address: '1 Main St', latitude: -37.8, longitude: 145.1 } },
  logs: '[07:50:01] Read from: Instagram\n[07:50:02] Searched Google',
  reports: [{ at: '2026-11-16T08:00:00Z', reason: 'Reported from place card', comment: 'wrong branch' }],
};

test('the trace shows every step in order, with the AI reply and the pick', () => {
  const text = formatTrace(row);
  const order = ['1. Where the reel came from', '2. The post', '3. What the AI read and returned',
    '4. What was searched and picked', '5. The result', '6. Reports from people', '7. Server log'];
  let previous = -1;
  for (const heading of order) {
    const found = text.indexOf(heading);
    assert.ok(found > previous, `${heading} comes after the step before it`);
    previous = found;
  }
  assert.match(text, /arrived by: shortcut/);
  assert.match(text, /\{"places":\[\{"name":"Place 1"\}\]\}/);
  assert.match(text, /picked by: app — the only result/);
  assert.match(text, /wrong branch/);
  assert.match(text, /Searched Google/);
});

test('a trace with missing parts still reads', () => {
  const text = formatTrace({ id: 'x', created_at: 'now', entry: 'app', reel_url: null, steps: {}, ai: null, search: {}, result: {}, reports: [] });
  assert.match(text, /AI: not used/);
  assert.match(text, /picked by: nothing picked/);
  assert.doesNotMatch(text, /6\. Reports/);
});

test('a long reply is cut and says how long it was', () => {
  const text = formatTrace({ ...row, ai: { raw: 'y'.repeat(5000) } });
  assert.match(text, /\(5000 characters\)/);
});

test('one line per lookup in the list', () => {
  const line = summaryLine(row);
  assert.match(line, /shortcut/);
  assert.match(line, /Place 1/);
  assert.match(line, /\[3f0c2b8e-6d1a-4c57-9b3e-2a7f1d8e5c10\]/);
});
