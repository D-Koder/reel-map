// Place logic: votes, duplicates, pins at one spot, Google matching, invites, collection order, hours.
import { describe, expect, it } from 'vitest';
import { getVibe } from '../../src/lib/constants.js';
import { bestPlaceMatch, duplicateIds, entriesAtSpot, googleMapsLink } from '../../src/lib/places.js';
import { formatInviteCode, inviteIdFromLink } from '../../src/hooks/useInvites.js';
import { orderCollections } from '../../src/hooks/useAppData.js';
import { openStatus, suburbOf } from '../../src/lib/hours.js';

describe('votes (getVibe)', () => {
  const members = ['a', 'b'];
  it.each([
    [{}, 'no-votes', 'No votes yet'],
    [{ a: 'keen', b: 'keen' }, 'both-in', 'All in'],
    [{ a: 'meh', b: 'meh' }, 'no-consensus', 'Not interested'],
    [{ a: 'keen', b: 'maybe' }, 'mixed-vibes', '1 of 2 keen'],
    [{ a: 'keen' }, 'mixed-vibes', '1 of 2 keen'],
  ])('%o → %s', (reactions, consensus, label) => {
    expect(getVibe(members, reactions)).toEqual({ consensus, label });
  });

  it('votes from people who left the collection do not count', () => {
    expect(getVibe(['a'], { a: 'keen', gone: 'meh' }).consensus).toBe('both-in');
  });
});

describe('duplicate warning', () => {
  it('flags the same reel twice and two places at the same spot', () => {
    const ids = duplicateIds([
      { id: 1, reel_url: 'r1', lat: 1, lng: 1 },
      { id: 2, reel_url: 'r1', lat: 5, lng: 5 },
      { id: 3, lat: -37.8, lng: 144.9 },
      { id: 4, lat: -37.800001, lng: 144.900001 },
      { id: 5, lat: 10, lng: 10 },
    ]);
    expect([...ids].sort()).toEqual([1, 2, 3, 4]);
  });

  it('events at one venue are not duplicates', () => {
    expect(duplicateIds([{ id: 1, category: 'event', lat: 1, lng: 1 }, { id: 2, category: 'event', lat: 1, lng: 1 }]).size).toBe(0);
  });
});

describe('pins at one spot (tapping a pin)', () => {
  it('lists each saved place at that spot once', () => {
    const list = entriesAtSpot([
      { id: 'a', lat: -37.8, lng: 144.9 },
      { id: 'a', lat: -37.8, lng: 144.9 },
      { id: 'b', lat: -37.8, lng: 144.9 },
      { id: 'c', lat: -37.7, lng: 144.9 },
      { id: 'd', lat: null, lng: null },
    ], -37.8, 144.9);
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('Google Maps link for a place', () => {
  it('uses the saved Maps page when there is one', () => {
    const url = 'https://www.google.com/maps/place/Gimlet/@-37.8,144.9';
    expect(googleMapsLink({ source_id: url })).toBe(url);
  });
  it('searches name + address otherwise', () => {
    expect(googleMapsLink({ name: 'Gimlet', address: '33 Russell St' })).toContain(encodeURIComponent('Gimlet, 33 Russell St'));
  });
  it('falls back to the pin, then to nothing', () => {
    expect(googleMapsLink({ lat: -37.8, lng: 144.9 })).toContain('query=-37.8,144.9');
    expect(googleMapsLink({ name: 'X' })).toBeNull();
  });
});

describe('bestPlaceMatch (choosing the Google result for a reel)', () => {
  const yoArt = { name: 'Yo Art Frozen Yoghurt (The Glen)' };
  const yoarthi = { name: 'Yoarthi' };
  it('one result is picked', () => expect(bestPlaceMatch([yoArt], [])).toBe(yoArt));
  it('whole words win over letters inside a word', () => expect(bestPlaceMatch([yoarthi, yoArt], ['YoArt'])).toBe(yoArt));
  it('a name written inside the hint', () => {
    const frenchie = { name: 'Frenchie' };
    expect(bestPlaceMatch([frenchie, { name: 'Le Bon' }], ['the restaurant is called Frenchie'])).toBe(frenchie);
  });
  it('a tie asks the user (null)', () => expect(bestPlaceMatch([{ name: 'Pho Bar' }, { name: 'Pho Bar' }], ['Pho Bar'])).toBeNull());
  it('no results → null', () => expect(bestPlaceMatch([], ['x'])).toBeNull());
});

describe('invite links and codes', () => {
  it('shows 8-letter codes as XXXX-XXXX', () => {
    expect(formatInviteCode('K7Q2XPMA')).toBe('K7Q2-XPMA');
    expect(formatInviteCode('a-long-old-code')).toBe('a-long-old-code');
  });
  it('reads the invite id from a pasted link', () => {
    const id = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    expect(inviteIdFromLink(`https://reel-map.app/?invite=${id}`)).toBe(id);
    expect(inviteIdFromLink('https://reel-map.app/?invite=nope')).toBeNull();
    expect(inviteIdFromLink('K7Q2-XPMA')).toBeNull();
  });
});

describe('collection order', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'new' }];
  it('my order first, collections I have not placed keep their usual order after', () => {
    expect(orderCollections(list, ['c', 'a']).map((c) => c.id)).toEqual(['c', 'a', 'b', 'new']);
  });
  it('no saved order keeps the list as it is', () => {
    expect(orderCollections(list, null).map((c) => c.id)).toEqual(['a', 'b', 'c', 'new']);
  });
});

describe('opening hours on the place card', () => {
  const hours = [
    { days: 'Monday', time: '11 AM–10:30 PM' },
    { days: 'Tuesday', time: 'Closed' },
    { days: 'Friday', time: '5 PM–1 AM' },
    { days: 'Saturday', time: '11:30 AM–3 PM, 5–10 PM' },
  ];
  // 2026-10-12 is a Monday.
  it.each([
    ['2026-10-12T12:00:00', { open: true, text: 'Open · closes 10:30 PM' }],
    ['2026-10-12T09:00:00', { open: false, text: 'Closed · opens 11 AM' }],
    ['2026-10-12T23:00:00', { open: false, text: 'Closed for today' }],
    ['2026-10-13T12:00:00', { open: false, text: 'Closed today' }],
    ['2026-10-17T00:30:00', { open: true, text: 'Open · closes 1 AM' }],
    ['2026-10-17T16:00:00', { open: false, text: 'Closed · opens 5 PM' }],
  ])('%s', (when, expected) => {
    expect(openStatus(hours, new Date(when))).toEqual(expected);
  });
  it('no hours → nothing shown', () => expect(openStatus([], new Date())).toBeNull());
  it('suburb from an address', () => {
    expect(suburbOf('46 Little La Trobe St, Melbourne VIC 3004, Australia')).toBe('Melbourne');
    expect(suburbOf('Gimlet')).toBeNull();
  });
});
