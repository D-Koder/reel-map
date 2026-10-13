// Places: add, edit, vote, copy, move, delete — and the alerts (notifications) each one sends.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, ok, shareWith, signIn, unique } from './helpers.js';

describe.skipIf(!hasDb)('places', () => {
  let one;
  let two;
  let shared;
  let other;

  const entries = (user, collectionId) => entriesIn(user.client, collectionId);
  const entry = async (user, collectionId, placeId) => (await entries(user, collectionId)).find((p) => p.id === placeId);

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
    shared = await ok(one.client.rpc('create_collection', { p_name: unique('places'), p_emoji: '🍽️' }));
    other = await ok(one.client.rpc('create_collection', { p_name: unique('places-other'), p_emoji: '📦' }));
    await shareWith(one, two, shared);
  });
  afterAll(() => cleanUp(one, two));

  it('add: the place shows for me and the other member, pin included', async () => {
    const name = unique('add');
    const id = await addPlace(one.client, shared, { name, lat: -37.81, lng: 144.96 });
    expect(await entry(one, shared, id)).toMatchObject({ name, lat: -37.81, lng: 144.96 });
    expect(await entry(two, shared, id)).toBeTruthy();
  });

  it('edit: name, emoji and category change for whoever added it', async () => {
    const id = await addPlace(one.client, shared);
    const name = unique('edited');
    await ok(one.client.from('collection_places')
      .update({ custom_name: name, custom_emoji: '🔥', category: 'cafe' })
      .eq('collection_id', shared).eq('place_id', id));
    expect(await entry(one, shared, id)).toMatchObject({ name, category: 'cafe' });
  });

  it('edit: someone else cannot change my place', async () => {
    const id = await addPlace(one.client, shared);
    const { data } = await two.client.from('collection_places')
      .update({ custom_name: 'Hacked' }).eq('collection_id', shared).eq('place_id', id).select();
    expect(data ?? []).toHaveLength(0);
  });

  it('edit: an event keeps its date', async () => {
    const id = await addPlace(one.client, shared, { category: 'event' });
    await ok(one.client.from('collection_places').update({ event_date: '2026-11-07' }).eq('collection_id', shared).eq('place_id', id));
    expect((await entry(one, shared, id)).event_date).toBe('2026-11-07');
  });

  it('vote: each member votes, and can change their vote', async () => {
    const id = await addPlace(one.client, shared);
    const vote = (user, feeling) => ok(user.client.from('reactions').upsert(
      { collection_id: shared, place_id: id, user_id: user.userId, feeling },
      { onConflict: 'collection_id,place_id,user_id' },
    ));
    await vote(one, 'keen');
    await vote(two, 'maybe');
    await vote(two, 'keen');
    expect((await entry(one, shared, id)).reactions).toEqual({ [one.userId]: 'keen', [two.userId]: 'keen' });
  });

  it('vote: I cannot vote as someone else', async () => {
    const id = await addPlace(one.client, shared);
    const { error } = await one.client.from('reactions').insert({ collection_id: shared, place_id: id, user_id: two.userId, feeling: 'meh' });
    expect(error).not.toBeNull();
  });

  it('copy: the place is in both collections', async () => {
    const id = await addPlace(one.client, shared, { name: unique('copy') });
    await ok(one.client.from('collection_places').insert({ collection_id: other, place_id: id, added_by: one.userId, category: 'food', custom_name: 'Copied' }));
    expect(await entry(one, shared, id)).toBeTruthy();
    expect(await entry(one, other, id)).toBeTruthy();
  });

  it('move: the place leaves one collection and lands in the other', async () => {
    const id = await addPlace(one.client, shared, { name: unique('move') });
    await ok(one.client.from('collection_places').update({ collection_id: other }).eq('collection_id', shared).eq('place_id', id));
    expect(await entry(one, shared, id)).toBeUndefined();
    expect(await entry(one, other, id)).toBeTruthy();
  });

  it('move: only whoever added it can move it', async () => {
    const id = await addPlace(one.client, shared);
    const mine = await ok(two.client.rpc('create_collection', { p_name: unique('two-target'), p_emoji: '🎯' }));
    const { data } = await two.client.from('collection_places').update({ collection_id: mine }).eq('collection_id', shared).eq('place_id', id).select();
    expect(data ?? []).toHaveLength(0);
    expect(await entry(one, shared, id)).toBeTruthy();
  });

  it('delete: gone from this collection, still in the other one', async () => {
    const id = await addPlace(one.client, shared, { name: unique('delete') });
    await ok(one.client.from('collection_places').insert({ collection_id: other, place_id: id, added_by: one.userId, category: 'food' }));
    await ok(one.client.rpc('delete_place', { p_collection_id: shared, p_place_id: id }));
    expect(await entry(one, shared, id)).toBeUndefined();
    expect(await entry(two, shared, id)).toBeUndefined();
    expect(await entry(one, other, id)).toBeTruthy();
  });

  it('book and mark done', async () => {
    const id = await addPlace(one.client, shared);
    const plannedAt = new Date(Date.now() + 86400000).toISOString();
    await ok(one.client.from('bookings').insert({ collection_id: shared, place_id: id, planned_at: plannedAt }));
    expect((await entry(two, shared, id)).booking?.planned_at).toBeTruthy();
    await ok(one.client.from('bookings').update({ done_at: new Date().toISOString(), marked_by: one.userId }).eq('collection_id', shared).eq('place_id', id));
    expect((await entry(two, shared, id)).booking?.done_at).toBeTruthy();
  });
});

// Alerts: every action above should notify the OTHER member, never the person who did it.
describe.skipIf(!hasDb)('alerts (notifications)', () => {
  let one;
  let two;
  let shared;

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
    shared = await ok(one.client.rpc('create_collection', { p_name: unique('alerts'), p_emoji: '🔔' }));
    await shareWith(one, two, shared);
  });
  afterAll(() => cleanUp(one, two));

  // The newest notification of this type for this user since `since`, waiting up to 5 s for triggers.
  async function newest(user, type, since) {
    for (let i = 0; i < 10; i += 1) {
      const rows = await ok(user.client.from('notifications').select('*')
        .eq('type', type).gt('created_at', since).order('created_at', { ascending: false }).limit(1));
      if (rows.length) return rows[0];
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }
  const now = () => new Date(Date.now() - 1000).toISOString();

  it('collection_joined: the owner hears when someone joins', async () => {
    const since = now();
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('join-alert'), p_emoji: '👋' }));
    await shareWith(one, two, id);
    expect(await newest(one, 'collection_joined', since)).toBeTruthy();
  });

  it('place_added: the other member hears, the adder does not', async () => {
    const since = now();
    const name = unique('alert-add');
    await addPlace(one.client, shared, { name });
    const alert = await newest(two, 'place_added', since);
    expect(alert?.message).toContain(name);
    expect(await newest(one, 'place_added', since)).toBeNull();
  });

  it('place_reacted: a vote notifies the person who added it', async () => {
    const id = await addPlace(one.client, shared);
    const since = now();
    await ok(two.client.from('reactions').insert({ collection_id: shared, place_id: id, user_id: two.userId, feeling: 'keen' }));
    expect(await newest(one, 'place_reacted', since)).toBeTruthy();
  });

  it('place_booked and place_done', async () => {
    const id = await addPlace(one.client, shared);
    const since = now();
    await ok(one.client.from('bookings').insert({ collection_id: shared, place_id: id, planned_at: new Date(Date.now() + 86400000).toISOString() }));
    expect(await newest(two, 'place_booked', since)).toBeTruthy();
    await ok(one.client.from('bookings').update({ done_at: new Date().toISOString(), marked_by: one.userId }).eq('collection_id', shared).eq('place_id', id));
    expect(await newest(two, 'place_done', since)).toBeTruthy();
  });

  it('place_removed', async () => {
    const id = await addPlace(one.client, shared);
    const since = now();
    await ok(one.client.rpc('delete_place', { p_collection_id: shared, p_place_id: id }));
    expect(await newest(two, 'place_removed', since)).toBeTruthy();
  });

  it('collection_left: the owner hears when a member leaves', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('leave-alert'), p_emoji: '🚪' }));
    await shareWith(one, two, id);
    const since = now();
    await ok(two.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', two.userId));
    expect(await newest(one, 'collection_left', since)).toBeTruthy();
  });

  it('collection_private: removed members hear the collection was locked', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('private-alert'), p_emoji: '🔒' }));
    await shareWith(one, two, id);
    const since = now();
    await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: true, p_confirm: true }));
    expect(await newest(two, 'collection_private', since)).toBeTruthy();
  });

  it('I only ever see my own notifications', async () => {
    const rows = await ok(two.client.from('notifications').select('user_id').limit(50));
    expect(rows.every((r) => r.user_id === two.userId)).toBe(true);
  });
});
