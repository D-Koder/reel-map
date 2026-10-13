// Collections: create, edit name, member count, share, lock (private) blocks sharing, kick, delete,
// import (create + add places), move between collections.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readCollectionFile, collectionToJSON } from '../../src/lib/collectionFile.js';
import { ACCOUNTS, addPlace, cleanUp, entriesIn, hasDb, memberIds, ok, shareWith, signIn, unique } from './helpers.js';

describe.skipIf(!hasDb)('collections', () => {
  let one;
  let two;
  const newCollection = (user, label = 'col', emoji = '📌') => ok(user.client.rpc('create_collection', { p_name: unique(label), p_emoji: emoji }));
  const listed = async (user, id) => (await ok(user.client.rpc('get_user_collections'))).find((c) => c.id === id);

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
  });
  afterAll(() => cleanUp(one, two));

  it('create: shows in my list with me as the only member', async () => {
    const id = await newCollection(one, 'create', '🍜');
    const row = await listed(one, id);
    expect(row).toMatchObject({ emoji: '🍜', is_private: false });
    expect(await memberIds(one.client, id)).toEqual([one.userId]);
  });

  it('edit name: owner can, a member cannot', async () => {
    const id = await newCollection(one, 'rename');
    await shareWith(one, two, id);
    const name = unique('renamed');
    await ok(one.client.from('collections').update({ name }).eq('id', id));
    expect((await listed(two, id)).name).toBe(name);
    const { data } = await two.client.from('collections').update({ name: unique('nope') }).eq('id', id).select();
    expect(data ?? []).toHaveLength(0);
  });

  it('a blank name is refused', async () => {
    const id = await newCollection(one, 'blank');
    const { error } = await one.client.from('collections').update({ name: '  ' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('correct member count: 1, then 2 after a join, then 1 after a kick', async () => {
    const id = await newCollection(one, 'count');
    expect(await memberIds(one.client, id)).toHaveLength(1);
    await shareWith(one, two, id);
    expect(await memberIds(one.client, id)).toHaveLength(2);
    expect(await memberIds(two.client, id)).toHaveLength(2);
    await ok(one.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', two.userId));
    expect(await memberIds(one.client, id)).toHaveLength(1);
  });

  it('share: a member sees the collection and its places', async () => {
    const id = await newCollection(one, 'share');
    const placeId = await addPlace(one.client, id, { name: unique('shared-place') });
    await shareWith(one, two, id);
    const places = await entriesIn(two.client, id);
    expect(places.some((p) => p.id === placeId)).toBe(true);
  });

  it('kick: the owner removes a member, who then loses access', async () => {
    const id = await newCollection(one, 'kick');
    await shareWith(one, two, id);
    await ok(one.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', two.userId));
    expect(await listed(two, id)).toBeUndefined();
  });

  it('kick: a member cannot remove the owner', async () => {
    const id = await newCollection(one, 'nokick');
    await shareWith(one, two, id);
    await two.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', one.userId);
    expect(await memberIds(one.client, id)).toContain(one.userId);
  });

  it('leave: a member can leave on their own', async () => {
    const id = await newCollection(one, 'leave');
    await shareWith(one, two, id);
    await ok(two.client.from('collection_members').delete().eq('collection_id', id).eq('user_id', two.userId));
    expect(await memberIds(one.client, id)).toEqual([one.userId]);
  });

  it('lock: making it private removes the other members', async () => {
    const id = await newCollection(one, 'lock');
    await shareWith(one, two, id);
    const removed = await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: true, p_confirm: true }));
    expect(removed).toBe(1);
    expect((await listed(one, id)).is_private).toBe(true);
    expect(await listed(two, id)).toBeUndefined();
  });

  it('lock: sharing is blocked while private (invite link)', async () => {
    const id = await newCollection(one, 'locked-link');
    await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: true, p_confirm: true }));
    // Either making the invite or using it must fail.
    let blocked = false;
    try {
      await shareWith(one, two, id);
    } catch {
      blocked = true;
    }
    expect(blocked, 'a private collection could still be joined by invite').toBe(true);
    expect(await memberIds(one.client, id)).toEqual([one.userId]);
  });

  it('lock: unlocking lets people join again', async () => {
    const id = await newCollection(one, 'unlock');
    await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: true, p_confirm: true }));
    await ok(one.client.rpc('set_collection_private', { p_collection_id: id, p_private: false, p_confirm: true }));
    await shareWith(one, two, id);
    expect(await memberIds(one.client, id)).toHaveLength(2);
  });

  it('delete: owner can, a member cannot', async () => {
    const id = await newCollection(one, 'delete');
    await shareWith(one, two, id);
    const { data } = await two.client.from('collections').delete().eq('id', id).select();
    expect(data ?? []).toHaveLength(0);
    await ok(one.client.from('collections').delete().eq('id', id));
    expect(await listed(one, id)).toBeUndefined();
    expect(await listed(two, id)).toBeUndefined();
  });

  it('export → import makes a new collection with the same places', async () => {
    const source = await newCollection(one, 'export');
    await addPlace(one.client, source, { name: 'Gimlet', note: 'booth please' });
    await addPlace(one.client, source, { name: 'Lune', category: 'cafe', lat: -37.80, lng: 144.98 });
    const exported = await entriesIn(one.client, source);

    const file = readCollectionFile(collectionToJSON({ name: unique('imported'), emoji: '📥' }, exported), 'x.json');
    const target = await ok(one.client.rpc('create_collection', { p_name: file.name, p_emoji: file.emoji }));
    for (const row of file.places) {
      await addPlace(one.client, target, { name: row.name, category: row.category, lat: row.lat, lng: row.lng, address: row.address, note: row.note });
    }
    const imported = await entriesIn(one.client, target);
    expect(imported.map((p) => p.name).sort()).toEqual(['Gimlet', 'Lune']);
  });
});
