// @vitest-environment jsdom
// Things that happen on the device or on a schedule: the Friday pick, and clearing saved data on
// log out / account delete so the next person on a shared phone sees nothing of yours.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickPlaceFor } from '../../../supabase/functions/send-friday-pick/pick.ts';
import { clearUserStorage, readJSON, writeJSON } from '../../src/lib/storage.js';

// A pretend Supabase client holding a few rows per table. Supports the .select().eq()/.in() chains pick.ts uses.
function fakeSupabase(tables) {
  return {
    from(table) {
      let rows = tables[table] ?? [];
      const query = {
        select: () => query,
        eq: (column, value) => { rows = rows.filter((r) => r[column] === value); return query; },
        in: (column, values) => { rows = rows.filter((r) => values.includes(r[column])); return query; },
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  };
}

describe('journey: Friday pick only suggests places nobody has booked', () => {
  const place = (id, collection) => ({ collection_id: collection, place_id: id, places: { id, name: `Place ${id}` } });
  const db = fakeSupabase({
    collection_members: [{ user_id: 'me', collection_id: 'mine' }, { user_id: 'me', collection_id: 'shared' }, { user_id: 'other', collection_id: 'theirs' }],
    collection_places: [place('a', 'mine'), place('b', 'mine'), place('c', 'shared'), place('d', 'shared'), place('x', 'theirs')],
    bookings: [{ place_id: 'a' }, { place_id: 'c' }],
  });

  it('every pick is from my collections and unbooked; each unbooked place can come up', async () => {
    const seen = new Set();
    for (const roll of [0, 0.49, 0.5, 0.99]) {
      const pick = await pickPlaceFor(db, 'me', () => roll);
      expect(['b', 'd']).toContain(pick.id);
      expect(pick.name).toBe(`Place ${pick.id}`);
      seen.add(pick.id);
    }
    expect([...seen].sort()).toEqual(['b', 'd']);
  });

  it('nothing to suggest → no notification', async () => {
    expect(await pickPlaceFor(db, 'nobody')).toBeNull();
    const allBooked = fakeSupabase({
      collection_members: [{ user_id: 'me', collection_id: 'mine' }],
      collection_places: [place('a', 'mine')],
      bookings: [{ place_id: 'a' }],
    });
    expect(await pickPlaceFor(allBooked, 'me')).toBeNull();
  });
});

describe('journey: log out clears my saved data, and only mine', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('my places cache, inbox, alerts and order go; the other account and other apps stay', () => {
    const mine = ['data', 'inbox', 'near-alerted', 'near-last-alert', 'collection-order', 'friday-snoozed', 'last-collection'];
    mine.forEach((name) => writeJSON(`reelmap:${name}:me`, { secret: true }));
    writeJSON('reelmap:data:friend', { theirs: true });
    writeJSON('other-app:me', 1);

    clearUserStorage('me');
    for (const name of mine) expect(readJSON(`reelmap:${name}:me`)).toBeNull();
    expect(readJSON('reelmap:data:friend')).toEqual({ theirs: true });
    expect(readJSON('other-app:me')).toBe(1);
  });

  it('storage that is full or blocked never breaks the app', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
    });
    expect(readJSON('x', 'fallback')).toBe('fallback');
    expect(() => writeJSON('x', 1)).not.toThrow();
    expect(() => clearUserStorage('me')).not.toThrow();
  });
});
