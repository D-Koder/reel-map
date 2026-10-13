// Collection journeys: the whole life of a shared collection, handing it to someone else,
// export → import, and keeping my order.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionToCSV, collectionToJSON, readCollectionFile } from '../../src/lib/collectionFile.js';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, memberIds, ok, shareWith, signIn, step, unique } from './helpers.js';

describe.skipIf(!hasDb)('Collections', () => {
  let one;
  let two;
  const newCollection = (user, label, emoji = '📌') => ok(user.client.rpc('create_collection', { p_name: unique(label), p_emoji: emoji }));
  const listed = async (user, id) => (await ok(user.client.rpc('get_user_collections'))).find((c) => c.id === id);
  const kick = (owner, id, userId) => ok(owner.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', userId));
  const invite = (user, id, patch = {}) => user.client.from('collection_invites').insert({
    collection_id: id, created_by: user.userId, expires_at: new Date(Date.now() + 86400000).toISOString(), ...patch,
  }).select('id, code').single();

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
  });
  afterAll(() => cleanUp(one, two));

  it('Share, lock and delete a collection', async () => {
    const id = await step('I create a collection and see it listed with just me', async () => {
      const created = await newCollection(one, 'life', '🍜');
      expect(await listed(one, created)).toMatchObject({ emoji: '🍜', is_private: false });
      expect(await memberIds(one.client, created)).toEqual([one.userId]);
      return created;
    });

    await step("I rename it, but a blank name isn't allowed", async () => {
      const name = unique('renamed');
      await ok(one.client.from('collections').update({ name }).eq('id', id));
      expect((await listed(one, id)).name).toBe(name);
      expect((await one.client.from('collections').update({ name: '  ' }).eq('id', id)).error).not.toBeNull();
    });

    const placeId = await step('I share an invite link; Test Two joins and sees the places', async () => {
      const added = await addPlace(one.client, id, { name: unique('shared-place') });
      const link = await shareWith(one, two, id);
      expect(await memberIds(one.client, id)).toHaveLength(2);
      expect(await memberIds(two.client, id)).toHaveLength(2);
      expect((await entriesIn(two.client, id)).map((p) => p.id)).toContain(added);
      expect(await ok(two.client.rpc('accept_collection_invite', { p_invite_id: link.id })), 'joining twice').toBe(false);
      return added;
    });

    await step("Test Two can't rename, delete, invite or kick me", async () => {
      expect((await two.client.from('collections').update({ name: unique('nope') }).eq('id', id).select()).data ?? []).toHaveLength(0);
      expect((await two.client.from('collections').delete().eq('id', id).select()).data ?? []).toHaveLength(0);
      expect((await invite(two, id)).error).not.toBeNull();
      await two.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', one.userId);
      expect(await memberIds(one.client, id)).toContain(one.userId);
    });

    await step('I remove Test Two and they lose access', async () => {
      await kick(one, id, two.userId);
      expect(await memberIds(one.client, id)).toEqual([one.userId]);
      expect(await listed(two, id)).toBeUndefined();
      expect((await entriesIn(two.client, id)).map((p) => p.id)).not.toContain(placeId);
    });

    await step('Test Two rejoins by typing my code in lower case with a dash', async () => {
      const code = unique('').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase().padStart(8, 'K');
      await ok(invite(one, id, { code }));
      const rows = await ok(two.client.rpc('join_collection_by_code', { p_code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` }));
      expect((Array.isArray(rows) ? rows[0] : rows).joined).toBe(true);
      expect(await memberIds(one.client, id)).toHaveLength(2);
    });

    await step('Test Two leaves on their own', async () => {
      await kick(two, id, two.userId);
      expect(await memberIds(one.client, id)).toEqual([one.userId]);
    });

    await step("Test Two can't use an expired invite", async () => {
      const old = await ok(invite(one, id, { expires_at: new Date(Date.now() - 1000).toISOString() }));
      expect((await two.client.rpc('accept_collection_invite', { p_invite_id: old.id })).error?.message).toMatch(/Invalid or expired/);
    });

    await step('I make it private and Test Two is removed', async () => {
      await shareWith(one, two, id);
      expect(await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: true, p_confirm: true }))).toBe(1);
      expect((await listed(one, id)).is_private).toBe(true);
      expect(await listed(two, id)).toBeUndefined();
    });

    await step("While it's private, nobody can join by invite (known bug)", async () => {
      let blocked = false;
      try {
        await shareWith(one, two, id);
      } catch {
        blocked = true;
      }
      expect(blocked, 'a locked collection could still be joined by invite').toBe(true);
      expect(await memberIds(one.client, id)).toEqual([one.userId]);
    });

    await step('I make it shared again and Test Two can rejoin', async () => {
      await kick(one, id, two.userId).catch(() => {});
      await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: false, p_confirm: true }));
      await shareWith(one, two, id);
      expect(await memberIds(one.client, id)).toHaveLength(2);
    });

    await step("I delete it and it's gone for both of us", async () => {
      await ok(one.client.from('collections').delete().eq('id', id));
      expect(await listed(one, id)).toBeUndefined();
      expect(await listed(two, id)).toBeUndefined();
    });
  });

  it('Hand a collection over to a friend', async () => {
    const id = await newCollection(one, 'transfer', '👑');
    await shareWith(one, two, id);

    await step('Only I can hand it over, and only to a member', async () => {
      expect((await two.client.rpc('transfer_collection_ownership', { p_collection_id: id, p_new_owner_id: two.userId })).error).not.toBeNull();
      const stranger = '00000000-0000-0000-0000-000000000000';
      expect((await one.client.rpc('transfer_collection_ownership', { p_collection_id: id, p_new_owner_id: stranger })).error).not.toBeNull();
    });

    await step('I hand it over to Test Two', () => ok(one.client.rpc('transfer_collection_ownership', { p_collection_id: id, p_new_owner_id: two.userId })));

    await step('I see Test Two is now the owner and I am a member', async () => {
      const roles = await ok(one.client.from('collection_members').select('user_id, role').eq('collection_id', id));
      expect(Object.fromEntries(roles.map((r) => [r.user_id, r.role]))).toEqual({ [one.userId]: 'member', [two.userId]: 'owner' });
    });

    await step('Test Two can rename it and invite people (known bug)', async () => {
      const { data } = await two.client.from('collections').update({ name: unique('new-owner') }).eq('id', id).select();
      expect(data ?? [], 'new owner cannot rename: collections.owner_id was not moved').toHaveLength(1);
      expect((await invite(two, id)).error).toBeNull();
    });

    await step("I can't delete it any more", async () => {
      const { data } = await one.client.from('collections').delete().eq('id', id).select();
      expect(data ?? [], 'old owner could still delete after handing it over').toHaveLength(0);
    });

    await cleanUp(two);
  });

  it('Export and import a collection', async () => {
    const source = await step('I make a collection with a food place and a cafe', async () => {
      const id = await newCollection(one, 'export');
      await addPlace(one.client, id, { name: 'Gimlet', note: 'booth, "the good one"' });
      await addPlace(one.client, id, { name: 'Lune', category: 'cafe', lat: -37.8, lng: 144.98 });
      return id;
    });
    const exported = await entriesIn(one.client, source);

    for (const [format, text, file] of [
      ['JSON', collectionToJSON({ name: unique('from-json'), emoji: '📥' }, exported), 'x.json'],
      ['CSV', collectionToCSV(exported), `${unique('from-csv')}.csv`],
    ]) {
      await step(`I export it as ${format} and import the file`, async () => {
        const read = readCollectionFile(text, file);
        const target = await ok(one.client.rpc('create_collection', { p_name: read.name, p_emoji: read.emoji ?? '📥' }));
        for (const row of read.places) {
          await addPlace(one.client, target, { name: row.name, category: row.category, lat: row.lat, lng: row.lng, address: row.address, note: row.note });
        }
        const imported = await entriesIn(one.client, target);
        expect(imported.map((p) => `${p.name}/${p.category}`).sort()).toEqual(['Gimlet/food', 'Lune/cafe']);
      });
    }
  });

  it('Reorder places and collections', async () => {
    const id = await newCollection(one, 'order');
    const ids = [await addPlace(one.client, id), await addPlace(one.client, id), await addPlace(one.client, id)];
    const reversed = [...ids].reverse();

    await step('I drag my places into reverse order', async () => {
      const rows = reversed.map((placeId, position) => ({ user_id: one.userId, collection_id: id, place_id: placeId, position }));
      await ok(one.client.from('place_order').upsert(rows, { onConflict: 'user_id,collection_id,place_id' }));
      const saved = await ok(one.client.from('place_order').select('place_id, position').eq('collection_id', id).order('position'));
      expect(saved.map((r) => r.place_id)).toEqual(reversed);
    });

    await step("My order doesn't change Test Two's order", async () => {
      await shareWith(one, two, id);
      expect(await ok(two.client.from('place_order').select('place_id').eq('collection_id', id).eq('user_id', one.userId))).toHaveLength(0);
    });

    await step('I see my collection order saved on my profile', async () => {
      const { data: before } = await one.client.from('profiles').select('collection_order').eq('id', one.userId).single();
      const other = await newCollection(one, 'order-b');
      try {
        await ok(one.client.from('profiles').update({ collection_order: [other, id] }).eq('id', one.userId));
        const { collection_order: saved } = await ok(one.client.from('profiles').select('collection_order').eq('id', one.userId).single());
        expect(saved.slice(0, 2)).toEqual([other, id]);
      } finally {
        await one.client.from('profiles').update({ collection_order: before?.collection_order ?? null }).eq('id', one.userId);
      }
    });
  });
});
