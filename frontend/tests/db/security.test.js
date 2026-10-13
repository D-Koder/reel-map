// Security: someone who was never invited (Test Two), and someone not logged in at all, try to read
// and change Test One's collection. Every attempt must come back empty or refused.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, addPlace, anonClient, cleanUp, entriesIn, hasDb, ok, signIn, step, unique } from './helpers.js';

describe.skipIf(!hasDb)('security journey', () => {
  let one;
  let two;
  let target;

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
    // Test One's collection, with a place, a vote, a booking and an invite. Test Two is NOT a member.
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('secret'), p_emoji: '🔐' }));
    const placeId = await addPlace(one.client, id, { name: unique('secret-place'), note: 'door code 1234' });
    await ok(one.client.from('reactions').insert({ collection_id: id, place_id: placeId, user_id: one.userId, feeling: 'keen' }));
    await ok(one.client.from('bookings').insert({ collection_id: id, place_id: placeId, planned_at: new Date(Date.now() + 86400000).toISOString() }));
    const invite = await ok(one.client.from('collection_invites').insert({
      collection_id: id, created_by: one.userId, code: 'SECRETXX', expires_at: new Date(Date.now() + 86400000).toISOString(),
    }).select('id').single());
    target = { id, placeId, inviteId: invite.id };
  });
  afterAll(() => cleanUp(one, two));

  // Each reader is checked against every table that holds Test One's data.
  const readers = () => [['a stranger (Test Two)', two.client], ['someone logged out', anonClient()]];

  it('strangers and logged-out visitors can read nothing', async () => {
    for (const [who, client] of readers()) {
      const none = async (label, query) => step(`${who}: ${label}`, async () => {
        const { data } = await query;
        expect(data ?? [], `${who} could read ${label}`).toHaveLength(0);
      });
      await none('the collection', client.from('collections').select('id').eq('id', target.id));
      await none('its members', client.from('collection_members').select('user_id').eq('collection_id', target.id));
      await none('its places', client.from('collection_places').select('place_id').eq('collection_id', target.id));
      await none('the place itself', client.from('places').select('id').eq('id', target.placeId));
      await none('votes', client.from('reactions').select('feeling').eq('collection_id', target.id));
      await none('bookings', client.from('bookings').select('planned_at').eq('collection_id', target.id));
      await none('invites', client.from('collection_invites').select('id').eq('collection_id', target.id));
      await none('notifications', client.from('notifications').select('id').eq('user_id', one.userId));
      await none('shared reels', client.from('shared_reels').select('id').eq('user_id', one.userId));
      await none('the Shortcut key', client.from('shortcut_keys').select('key').eq('user_id', one.userId));
      await none('place order', client.from('place_order').select('place_id').eq('user_id', one.userId));
    }
    await step('a stranger: not in my lists either', async () => {
      expect((await ok(two.client.rpc('get_user_collections'))).map((c) => c.id)).not.toContain(target.id);
      expect((await entriesIn(two.client, target.id))).toHaveLength(0);
    });
  });

  it('strangers and logged-out visitors can change nothing', async () => {
    for (const [who, client] of readers()) {
      const refused = async (label, query) => step(`${who}: ${label}`, async () => {
        const { data, error } = await query;
        expect(Boolean(error) || (data ?? []).length === 0, `${who} could ${label}`).toBe(true);
      });
      await refused('rename the collection', client.from('collections').update({ name: 'Hacked' }).eq('id', target.id).select());
      await refused('delete the collection', client.from('collections').delete().eq('id', target.id).select());
      await refused('add themselves as a member', client.from('collection_members').insert({ collection_id: target.id, user_id: two.userId, role: 'member' }).select());
      await refused('add a place to it', client.from('collection_places').insert({ collection_id: target.id, place_id: target.placeId, added_by: two.userId, category: 'food' }).select());
      await refused('rename the place', client.from('collection_places').update({ custom_name: 'Hacked' }).eq('collection_id', target.id).select());
      await refused('vote', client.from('reactions').insert({ collection_id: target.id, place_id: target.placeId, user_id: two.userId, feeling: 'meh' }).select());
      await refused('cancel the booking', client.from('bookings').delete().eq('collection_id', target.id).select());
      await refused('make an invite', client.from('collection_invites').insert({ collection_id: target.id, created_by: two.userId, expires_at: new Date(Date.now() + 86400000).toISOString() }).select());
      await refused('delete the place', client.rpc('delete_place', { p_collection_id: target.id, p_place_id: target.placeId }));
      await refused('make it private', client.rpc('set_collection_private', { p_collection_id: target.id, p_private: true, p_confirm: true }));
    }
    await step('nothing actually changed', async () => {
      const [row] = await entriesIn(one.client, target.id);
      expect(row).toMatchObject({ id: target.placeId, reactions: { [one.userId]: 'keen' } });
      expect(row.booking).toBeTruthy();
    });
  });

  it('guessing invites gets nowhere; logged out you cannot join at all', async () => {
    await step('a made-up invite id', async () => {
      const { error } = await two.client.rpc('accept_collection_invite', { p_invite_id: '00000000-0000-4000-8000-000000000000' });
      expect(error?.message).toMatch(/Invalid or expired/);
    });
    await step('a made-up code', async () => {
      expect((await two.client.rpc('join_collection_by_code', { p_code: 'ZZZZ-9999' })).error).not.toBeNull();
    });
    await step('logged out, even a real invite is refused', async () => {
      expect((await anonClient().rpc('accept_collection_invite', { p_invite_id: target.inviteId })).error).not.toBeNull();
    });
  });
});
