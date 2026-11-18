// Run with: node --test api/_lib/place-list.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { placesFromAi } = require('./place-list');

const reel = {
  caption: 'Queen Victoria Christmas Night Market 25 Nov – 16 Dec. Also the Swedish Christmas Market, Toorak',
  locationTag: '',
  creator: 'amritaandsathya',
  tagged: [],
};

test('every place in a list post is kept, in order', () => {
  const ai = {
    kind: 'list', postArea: 'Melbourne',
    places: [
      { name: 'Queen Victoria Christmas Night Market', category: 'event', area: 'Melbourne' },
      { name: 'Swedish Christmas Market', category: 'event', area: 'Toorak' },
    ],
  };
  const places = placesFromAi(ai, reel);
  assert.deepEqual(places.map((p) => p.name), ['Queen Victoria Christmas Night Market', 'Swedish Christmas Market']);
  assert.equal(places[1].area, 'Toorak');
});

test('a name the post does not write is flagged for checking', () => {
  const ai = { kind: 'single', places: [{ name: 'The Night Market at QVM', category: 'event' }] };
  const [place] = placesFromAi(ai, reel);
  assert.equal(place.nameUnchecked, true);
});

test('the same name listed twice is saved once', () => {
  const ai = { places: [{ name: 'Swedish Christmas Market' }, { name: 'swedish christmas market' }] };
  assert.equal(placesFromAi(ai, reel).length, 1);
});

test('a pop-up is an event, and its dates and prices come from the answer', () => {
  const ai = {
    temporary: true, startDate: '2026-11-25', endDate: '2026-12-16', price: 'Free', contact: '', howToBook: '',
    locationNote: '', runs: [{ startDate: '2026-11-25', endDate: '2026-12-16' }],
    places: [{ name: 'Queen Victoria Christmas Night Market', category: 'food' }],
  };
  const [place] = placesFromAi(ai, reel);
  assert.equal(place.category, 'event');
  assert.equal(place.startDate, '2026-11-25');
  assert.equal(place.endDate, '2026-12-16');
  assert.equal(place.price, 'Free');
});

test('a place that is not a pop-up gets no dates', () => {
  const ai = { temporary: false, startDate: '2026-11-25', places: [{ name: 'Queen Victoria Christmas Night Market', category: 'other' }] };
  const [place] = placesFromAi(ai, reel);
  assert.equal(place.startDate, '');
  assert.equal(place.category, 'other');
});

test('an unknown category falls back to food, and a nameless entry is dropped', () => {
  const ai = { places: [{ name: 'Swedish Christmas Market', category: 'shop' }, { name: '' }, { name: '   ' }] };
  const places = placesFromAi(ai, reel);
  assert.equal(places.length, 1);
  assert.equal(places[0].category, 'food');
});

test('no answer gives no places', () => {
  assert.deepEqual(placesFromAi(null, reel), []);
  assert.deepEqual(placesFromAi({ kind: 'none', places: [] }, reel), []);
});

test('each place in a list post keeps its own dates, and a dated place is an event', () => {
  const ai = {
    kind: 'list',
    places: [
      { name: 'Swedish Christmas Market', category: 'food', start_date: '2026-11-19', end_date: '2026-12-17' },
      { name: 'German Christmas Market', category: 'food', start_date: '2026-11-27', end_date: '2026-11-27' },
      { name: 'Queen Victoria Christmas Night Market', category: 'food' },
    ],
  };
  const [swedish, german, undated] = placesFromAi(ai, reel);
  assert.equal(swedish.startDate, '2026-11-19');
  assert.equal(swedish.endDate, '2026-12-17');
  assert.equal(swedish.category, 'event');
  assert.equal(german.startDate, '2026-11-27');
  assert.equal(undated.startDate, '');
  assert.equal(undated.category, 'food');
});
