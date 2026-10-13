// Exporting a collection and importing it (or a Google Maps list) back in.
import { describe, expect, it } from 'vitest';
import {
  IMPORT_LIMIT,
  collectionToCSV,
  collectionToJSON,
  coordsFromMapsUrl,
  parseCSV,
  readCollectionFile,
} from '../../src/lib/collectionFile.js';

const collection = { name: 'Date night', emoji: '💘' };
const places = [
  {
    name: 'Gimlet',
    category: 'food',
    address: '33 Russell St, Melbourne VIC 3000',
    lat: -37.8155,
    lng: 144.9714,
    source_id: 'https://www.google.com/maps/place/Gimlet',
    reel_url: 'https://www.instagram.com/reel/ABC/',
    custom_info: 'Ask for the booth, "the good one"',
    hours: [{ days: 'Monday', time: '12–11 PM' }],
    event_date: null,
  },
  { name: 'Night Market', category: 'event', address: null, lat: null, lng: null, event_date: '2026-11-07' },
];

describe('export', () => {
  it('JSON keeps everything needed to rebuild the collection', () => {
    const data = JSON.parse(collectionToJSON(collection, places));
    expect(data.kind).toBe('reel-map-collection');
    expect(data.collection).toEqual({ name: 'Date night', emoji: '💘' });
    expect(data.places).toHaveLength(2);
    expect(data.places[0]).toMatchObject({
      name: 'Gimlet',
      maps_url: 'https://www.google.com/maps/place/Gimlet',
      note: 'Ask for the booth, "the good one"',
      hours: [{ days: 'Monday', time: '12–11 PM' }],
    });
    expect(data.places[1]).toMatchObject({ category: 'event', event_date: '2026-11-07' });
  });

  it('votes are never exported', () => {
    const text = collectionToJSON(collection, [{ ...places[0], reactions: { u1: 'keen' } }]);
    expect(text).not.toContain('keen');
  });

  it('CSV quotes cells with commas and quotes', () => {
    const csv = collectionToCSV(places);
    const rows = parseCSV(csv);
    expect(rows[0]).toEqual(['Title', 'Note', 'URL', 'Address', 'Category', 'Reel', 'Website', 'Latitude', 'Longitude']);
    expect(rows[1][1]).toBe('Ask for the booth, "the good one"');
    expect(rows[1][3]).toBe('33 Russell St, Melbourne VIC 3000');
  });
});

describe('import', () => {
  it('JSON export → import gives the same places back', () => {
    const file = readCollectionFile(collectionToJSON(collection, places), 'date-night-reel-map.json');
    expect(file.name).toBe('Date night');
    expect(file.emoji).toBe('💘');
    expect(file.places.map((p) => p.name)).toEqual(['Gimlet', 'Night Market']);
    expect(file.places[0]).toMatchObject({ lat: -37.8155, lng: 144.9714, category: 'food' });
    expect(file.places[1]).toMatchObject({ category: 'event', eventDate: '2026-11-07' });
  });

  it('CSV export → import gives the same places back, named after the file', () => {
    const file = readCollectionFile(collectionToCSV(places), 'date-night-reel-map.csv');
    expect(file.name).toBe('date night');
    expect(file.places.map((p) => p.name)).toEqual(['Gimlet', 'Night Market']);
    expect(file.places[0].note).toBe('Ask for the booth, "the good one"');
  });

  it('reads a Google Takeout saved list (Title, Note, URL)', () => {
    const csv = 'Title,Note,URL\r\nLune,,https://www.google.com/maps/place/Lune/data=!3d-37.80!4d144.98\r\n';
    const file = readCollectionFile(csv, 'Want to go.csv');
    expect(file.places[0]).toMatchObject({ name: 'Lune', lat: -37.8, lng: 144.98, category: 'food' });
  });

  it('a URL that is not a Maps link becomes the website', () => {
    const file = readCollectionFile('Name,URL\nGimlet,https://gimlet.melbourne', 'x.csv');
    expect(file.places[0]).toMatchObject({ url: 'https://gimlet.melbourne', mapsUrl: null });
  });

  it('guesses cafe and event from the name', () => {
    const file = readCollectionFile('Name\nPatricia Coffee\nNight Market\nPho Bar', 'x.csv');
    expect(file.places.map((p) => p.category)).toEqual(['cafe', 'event', 'food']);
  });

  it('rows with no name are skipped and counted', () => {
    const file = readCollectionFile('Name,Note\nGimlet,yes\n,orphan note', 'x.csv');
    expect(file.places).toHaveLength(1);
    expect(file.skipped).toBe(1);
  });

  it(`stops at ${IMPORT_LIMIT} places and says how many were cut`, () => {
    const rows = Array.from({ length: IMPORT_LIMIT + 5 }, (_, i) => `Place ${i}`).join('\n');
    const file = readCollectionFile(`Name\n${rows}`, 'big.csv');
    expect(file.places).toHaveLength(IMPORT_LIMIT);
    expect(file.cut).toBe(5);
  });

  it('a spreadsheet without a name column is refused', () => {
    expect(() => readCollectionFile('Foo,Bar\n1,2', 'x.csv')).toThrow(/No Title or Name column/);
  });

  it('a JSON file that is not ours is refused', () => {
    expect(() => readCollectionFile('{"hello":1}', 'x.json')).toThrow(/isn't a Reel Map file/);
    expect(() => readCollectionFile('{broken', 'x.json')).toThrow(/isn't a Reel Map file/);
  });

  it('drops links that are not http(s)', () => {
    const json = JSON.stringify({ kind: 'reel-map-collection', places: [{ name: 'X', url: 'javascript:alert(1)' }] });
    expect(readCollectionFile(json, 'x.json').places[0].url).toBeNull();
  });
});

describe('coordsFromMapsUrl', () => {
  it.each([
    ['https://www.google.com/maps/place/X/@-37.81,144.96,17z', { lat: -37.81, lng: 144.96 }],
    ['https://www.google.com/maps/place/X/data=!3d-37.8!4d144.9', { lat: -37.8, lng: 144.9 }],
    ['https://www.google.com/maps/search/?api=1&query=-37.8,144.9', { lat: -37.8, lng: 144.9 }],
    ['https://www.google.com/maps/place/X', null],
    ['https://www.google.com/maps/@200,500,17z', null],
  ])('%s', (url, expected) => {
    expect(coordsFromMapsUrl(url)).toEqual(expected);
  });
});
