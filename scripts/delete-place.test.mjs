// Run with: node --test scripts/delete-place.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReelUrl, deletePlace, findPlaces } from './delete-place.mjs';

const ID = '9741decd-6165-4fb9-a6d5-46a569e59b7c';
const TRACE = '3f0c2b8e-6d1a-4c57-9b3e-2a7f1d8e5c10';

// A fake PostgREST: one place, one matching row in each related table.
function fakeServer(log) {
  return async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = url.replace(/^https:\/\/example\.test\/rest\/v1\//, '');
    log.push(`${method} ${path.split('?')[0]}`);
    const table = path.split('?')[0];
    const rows = {
      places: [{ id: ID, name: 'Biblio Cafe', reel_url: 'https://www.instagram.com/reel/DfolNtRpecQ/?igsh=abc', lookup_trace_id: TRACE }],
      notifications: [{}], reactions: [{}], bookings: [], collection_places: [{}, {}], lookup_traces: [{}], reel_lookups: [{}],
    }[table] || [];
    return { ok: true, json: async () => rows };
  };
}

test('a dry run shows what would go and deletes nothing', async () => {
  const log = [];
  const result = await deletePlace(ID, { apply: false, url: 'https://example.test', key: 'k', fetchImpl: fakeServer(log) });
  assert.equal(result.dryRun, true);
  assert.equal(result.name, 'Biblio Cafe');
  assert.equal(result.reelUrl, 'https://www.instagram.com/reel/DfolNtRpecQ/?igsh=abc', 'the reel link comes back as saved');
  assert.deepEqual(result.deleted, { notifications: 1, reactions: 1, bookings: 0, collection_places: 2, places: 1, lookup_traces: 1, reel_lookups: 1 });
  assert.equal(log.some((line) => line.startsWith('DELETE')), false, 'no DELETE in a dry run');
});

test('with apply, each related table is deleted', async () => {
  const log = [];
  const result = await deletePlace(ID, { apply: true, url: 'https://example.test', key: 'k', fetchImpl: fakeServer(log) });
  assert.equal(result.dryRun, false);
  assert.equal(log.filter((line) => line.startsWith('DELETE')).length, 7);
  assert.equal(result.deleted.places, 1);
});

test('a place that is not there changes nothing', async () => {
  const empty = async () => ({ ok: true, json: async () => [] });
  const result = await deletePlace(ID, { apply: true, url: 'https://example.test', key: 'k', fetchImpl: empty });
  assert.deepEqual(result.deleted, {});
  assert.equal(result.reelUrl, null);
});

test('the reel link is cleaned for the cache key', () => {
  assert.equal(cleanReelUrl('https://www.instagram.com/reel/DfolNtRpecQ/?igsh=abc'), 'https://www.instagram.com/reel/DfolNtRpecQ/');
  assert.equal(cleanReelUrl('https://www.instagram.com/reel/DfolNtRpecQ'), 'https://www.instagram.com/reel/DfolNtRpecQ/');
  assert.equal(cleanReelUrl('https://example.com/reel/x'), null);
  assert.equal(cleanReelUrl(null), null);
});

test('text finds places by name, address and caption, without repeats', async () => {
  const fake = async (url) => {
    const path = decodeURIComponent(url.replace(/^https:\/\/example\.test\/rest\/v1\//, ''));
    const place = (id, name, created) => ({ id, name, address: 'Swanston St', reel_url: 'https://www.instagram.com/reel/x/', created_at: created });
    if (path.startsWith('places?name=')) return { ok: true, json: async () => [place('a', 'Biblio Cafe', '2026-11-16')] };
    if (path.startsWith('places?address=')) return { ok: true, json: async () => [place('a', 'Biblio Cafe', '2026-11-16')] };
    if (path.startsWith('places?custom_info=')) return { ok: true, json: async () => [] };
    if (path.startsWith('lookup_traces?caption=')) return { ok: true, json: async () => [{ id: TRACE }] };
    if (path.startsWith('places?lookup_trace_id=in.')) return { ok: true, json: async () => [place('b', 'Other', '2026-11-17')] };
    throw new Error(`unexpected ${path}`);
  };
  const found = await findPlaces('biblio', { url: 'https://example.test', key: 'k', fetchImpl: fake });
  assert.deepEqual(found.map((p) => p.id), ['b', 'a'], 'newest first, and the place listed twice appears once');
  await assert.rejects(findPlaces('x', { url: 'https://example.test', key: 'k', fetchImpl: fake }), /at least 2/);
});

test('a bad id is refused before any call', async () => {
  await assert.rejects(deletePlace('not-an-id', { url: 'https://example.test', key: 'k', fetchImpl: fakeServer([]) }), /UUID/);
});
