// Place journeys: the whole life of a place, booking it, every alert it sends, and live updates.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, ok, shareWith, signIn, step, unique, waitFor } from './helpers.js';

describe.skipIf(!hasDb)('place journeys', () => {
  let one;
  let two;
  let shared;
  const entry = async (user, collectionId, placeId) => (await entriesIn(user.client, collectionId)).find((p) => p.id === placeId);
  const vote = (user, collectionId, placeId, feeling) => user.client.from('reactions').upsert(
    { collection_id: collectionId, place_id: placeId, user_id: user.userId, feeling },
    { onConflict: 'collection_id,place_id,user_id' },
  );

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
    shared = await ok(one.client.rpc('create_collection', { p_name: unique('places'), p_emoji: '🍽️' }));
    await shareWith(one, two, shared);
  });
  afterAll(() => cleanUp(one, two));

  it('add → edit → vote → copy → move → delete', async () => {
    const later = await ok(one.client.rpc('create_collection', { p_name: unique('later'), p_emoji: '📦' }));
    const dates = await ok(one.client.rpc('create_collection', { p_name: unique('dates'), p_emoji: '💘' }));
    const name = unique('journey');

    const id = await step('1. add: both members see it, pin included', async () => {
      const added = await addPlace(one.client, shared, { name, lat: -37.81, lng: 144.96 });
      expect(await entry(one, shared, added)).toMatchObject({ name, lat: -37.81, lng: 144.96 });
      expect(await entry(two, shared, added)).toBeTruthy();
      return added;
    });

    await step('2. edit name, emoji and category', async () => {
      await ok(one.client.from('collection_places').update({ custom_name: `${name}!`, custom_emoji: '🔥', category: 'cafe' })
        .eq('collection_id', shared).eq('place_id', id));
      expect(await entry(two, shared, id)).toMatchObject({ name: `${name}!`, category: 'cafe' });
    });

    await step("3. the other member can't edit or move my place", async () => {
      expect((await two.client.from('collection_places').update({ custom_name: 'Hacked' }).eq('collection_id', shared).eq('place_id', id).select()).data ?? []).toHaveLength(0);
      expect((await two.client.from('collection_places').update({ collection_id: later }).eq('collection_id', shared).eq('place_id', id).select()).data ?? []).toHaveLength(0);
    });

    await step('4. both vote, Test Two changes their mind; nobody can vote for someone else', async () => {
      await ok(vote(one, shared, id, 'keen'));
      await ok(vote(two, shared, id, 'maybe'));
      await ok(vote(two, shared, id, 'keen'));
      expect((await entry(one, shared, id)).reactions).toEqual({ [one.userId]: 'keen', [two.userId]: 'keen' });
      const { error } = await one.client.from('reactions').insert({ collection_id: shared, place_id: id, user_id: two.userId, feeling: 'meh' });
      expect(error).not.toBeNull();
    });

    await step('5. copy to Later: now in both, votes stay with each collection', async () => {
      await ok(one.client.from('collection_places').insert({ collection_id: later, place_id: id, added_by: one.userId, category: 'food', custom_name: name }));
      expect(await entry(one, shared, id)).toBeTruthy();
      expect((await entry(one, later, id)).reactions).toEqual({});
    });

    await step('6. move the copy from Later to Dates', async () => {
      await ok(one.client.from('collection_places').update({ collection_id: dates }).eq('collection_id', later).eq('place_id', id));
      expect(await entry(one, later, id)).toBeUndefined();
      expect(await entry(one, dates, id)).toBeTruthy();
    });

    await step('7. delete from the shared collection: gone for both, still in Dates', async () => {
      await ok(one.client.rpc('delete_place', { p_collection_id: shared, p_place_id: id }));
      expect(await entry(one, shared, id)).toBeUndefined();
      expect(await entry(two, shared, id)).toBeUndefined();
      expect(await entry(one, dates, id)).toBeTruthy();
    });

    await step('8. delete the last copy', async () => {
      await ok(one.client.rpc('delete_place', { p_collection_id: dates, p_place_id: id }));
      expect(await entry(one, dates, id)).toBeUndefined();
    });
  });

  it('event date → book → second booking refused → mark done → streak', async () => {
    const id = await addPlace(one.client, shared, { category: 'event' });

    await step('1. an event keeps its date', async () => {
      await ok(one.client.from('collection_places').update({ event_date: '2026-11-07' }).eq('collection_id', shared).eq('place_id', id));
      expect((await entry(two, shared, id)).event_date).toBe('2026-11-07');
    });

    await step('2. book it: the other member sees the booking', async () => {
      await ok(one.client.from('bookings').insert({ collection_id: shared, place_id: id, planned_at: new Date(Date.now() + 86400000).toISOString() }));
      expect((await entry(two, shared, id)).booking?.planned_at).toBeTruthy();
    });

    await step('3. a second booking of the same place is refused ("Someone already booked this place")', async () => {
      const { error } = await two.client.from('bookings').insert({ collection_id: shared, place_id: id, planned_at: new Date(Date.now() + 2 * 86400000).toISOString() });
      expect(error?.code).toBe('23505');
    });

    const streakOf = async () => (await ok(one.client.rpc('get_streak')))?.[0]?.current_streak ?? 0;
    const before = await streakOf();
    await step('4. mark it done', async () => {
      await ok(one.client.from('bookings').update({ done_at: new Date().toISOString(), marked_by: one.userId }).eq('collection_id', shared).eq('place_id', id));
      expect((await entry(two, shared, id)).booking?.done_at).toBeTruthy();
    });
    await step('5. my streak counts it (shown in the 🎉 celebration)', async () => {
      const after = await streakOf();
      expect(after, 'streak did not go up after a place was done').toBeGreaterThanOrEqual(Math.max(before, 1));
    });
  });

  it('live updates: Test Two sees a new place without refreshing', async () => {
    const events = [];
    const channel = two.client.channel(unique('live'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collection_places', filter: `collection_id=eq.${shared}` }, (e) => events.push(e))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (e) => events.push(e));
    try {
      await step('1. Test Two is listening', () => new Promise((resolve, reject) => {
        channel.subscribe((status, error) => (status === 'SUBSCRIBED' ? resolve() : status.includes('ERROR') && reject(error ?? new Error(status))));
      }));
      const id = await step('2. Test One adds a place', () => addPlace(one.client, shared, { name: unique('live') }));
      await step('3. it arrives', async () => {
        expect(await waitFor(() => events.find((e) => e.table === 'collection_places' && e.new.place_id === id), 10000), 'no live insert').toBeTruthy();
      });
      await step('4. a vote arrives too', async () => {
        await ok(vote(one, shared, id, 'keen'));
        expect(await waitFor(() => events.find((e) => e.table === 'reactions' && e.new?.place_id === id), 10000), 'no live vote').toBeTruthy();
      });
    } finally {
      await two.client.removeChannel(channel);
    }
  });
});

// Alerts: every action notifies the OTHER member, never the person who did it.
describe.skipIf(!hasDb)('alerts journey', () => {
  let one;
  let two;

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
  });
  afterAll(() => cleanUp(one, two));

  // The newest notification of this type for this user since `since` (waits for triggers).
  const newest = (user, type, since) => waitFor(async () => (await ok(user.client.from('notifications').select('*')
    .eq('type', type).gt('created_at', since).order('created_at', { ascending: false }).limit(1)))[0]);
  const mark = () => new Date(Date.now() - 1000).toISOString();

  it('join → add → vote → book → done → remove → leave → lock: each one alerts the right person', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('alerts'), p_emoji: '🔔' }));
    let since = mark();

    await step('1. collection_joined → owner', async () => {
      await shareWith(one, two, id);
      expect(await newest(one, 'collection_joined', since)).toBeTruthy();
    });

    const name = unique('alert-place');
    const placeId = await step('2. place_added → the other member, not the adder', async () => {
      since = mark();
      const added = await addPlace(one.client, id, { name });
      expect((await newest(two, 'place_added', since))?.message).toContain(name);
      await new Promise((r) => setTimeout(r, 1500));
      expect(await ok(one.client.from('notifications').select('id').eq('type', 'place_added').gt('created_at', since)), 'the adder was alerted about their own place').toHaveLength(0);
      return added;
    });

    await step('3. place_reacted → whoever added it', async () => {
      since = mark();
      await ok(two.client.from('reactions').insert({ collection_id: id, place_id: placeId, user_id: two.userId, feeling: 'keen' }));
      expect(await newest(one, 'place_reacted', since)).toBeTruthy();
    });

    await step('4. place_booked and place_done → the other member', async () => {
      since = mark();
      await ok(one.client.from('bookings').insert({ collection_id: id, place_id: placeId, planned_at: new Date(Date.now() + 86400000).toISOString() }));
      expect(await newest(two, 'place_booked', since)).toBeTruthy();
      await ok(one.client.from('bookings').update({ done_at: new Date().toISOString(), marked_by: one.userId }).eq('collection_id', id).eq('place_id', placeId));
      expect(await newest(two, 'place_done', since)).toBeTruthy();
    });

    await step('5. place_removed → the other member', async () => {
      since = mark();
      await ok(one.client.rpc('delete_place', { p_collection_id: id, p_place_id: placeId }));
      expect(await newest(two, 'place_removed', since)).toBeTruthy();
    });

    await step('6. collection_left → owner', async () => {
      since = mark();
      await ok(two.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', two.userId));
      expect(await newest(one, 'collection_left', since)).toBeTruthy();
    });

    await step('7. collection_private → the member who was removed', async () => {
      await shareWith(one, two, id);
      since = mark();
      await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: true, p_confirm: true }));
      expect(await newest(two, 'collection_private', since)).toBeTruthy();
    });

    await step('8. I only ever see my own notifications', async () => {
      const rows = await ok(two.client.from('notifications').select('user_id').limit(50));
      expect(rows.every((r) => r.user_id === two.userId)).toBe(true);
    });
  });
});
