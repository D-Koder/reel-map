// Run with: node --test api/_lib/list-lookup.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { lookupListPlaces, queryFor } = require('./list-lookup');

// A simple matcher for the tests: the first candidate, or none when there are two.
const pickOnlyOne = (candidates) => (candidates.length === 1 ? candidates[0] : null);

const details = async (url) => ({
  name: 'Swedish Christmas Market', address: '1 Toorak Rd, Toorak VIC', latitude: -37.84, longitude: 145.01,
  hours: [{ day: 'Sat', open: '10:00', close: '18:00' }], phone: '03 9999 0000', websiteUrl: 'https://example.test',
  mapsUrl: url,
});

test('a place with one clear result is read and ready to save', async () => {
  const [result] = await lookupListPlaces([{ name: 'Swedish Christmas Market', area: 'Toorak', category: 'event' }], {
    search: async () => ({ candidates: [{ name: 'Swedish Christmas Market', url: 'https://maps/1' }] }),
    details,
    pickBest: pickOnlyOne,
  });
  assert.equal(result.status, 'saved');
  assert.equal(result.place.lat, -37.84);
  assert.equal(result.place.lng, 145.01);
  assert.equal(result.place.phone, '03 9999 0000');
  assert.equal(result.place.category, 'event');
});

test('two results with no clear pick is listed for the person to choose', async () => {
  const [result] = await lookupListPlaces([{ name: 'Market' }], {
    search: async () => ({ candidates: [{ url: 'a' }, { url: 'b' }] }),
    details,
    pickBest: pickOnlyOne,
  });
  assert.equal(result.status, 'needs_pick');
  assert.equal(result.candidates.length, 2);
});

test('a failed search is listed as failed, and the other places still get looked up', async () => {
  const results = await lookupListPlaces([{ name: 'Broken' }, { name: 'Fine' }], {
    search: async (query) => {
      if (query.startsWith('Broken')) throw new Error('Chrome closed');
      return { candidates: [{ url: 'ok' }] };
    },
    details,
    pickBest: pickOnlyOne,
  });
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].error, /Chrome closed/);
  assert.equal(results[1].status, 'saved');
});

test('a place with no location from Google is failed, not saved without one', async () => {
  const [result] = await lookupListPlaces([{ name: 'No location' }], {
    search: async () => ({ candidates: [{ url: 'x' }] }),
    details: async () => ({ name: 'No location', address: '' }),
    pickBest: pickOnlyOne,
  });
  assert.equal(result.status, 'failed');
});

test('a place the search finds nothing for is failed', async () => {
  const [result] = await lookupListPlaces([{ name: 'Nowhere' }], {
    search: async () => ({ candidates: [] }),
    details,
    pickBest: pickOnlyOne,
  });
  assert.equal(result.status, 'failed');
});

test('the search text is the name, then address and area', () => {
  assert.equal(queryFor({ name: 'Swedish Christmas Market', area: 'Toorak' }), 'Swedish Christmas Market, Toorak');
  assert.equal(queryFor({ name: 'Cafe', address: '1 Main St', area: '' }), 'Cafe, 1 Main St');
});
