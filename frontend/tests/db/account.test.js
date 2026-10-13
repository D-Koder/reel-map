// Account journeys: sign up → profile → delete, deleting an account that shares collections,
// and the iPhone Shortcut inbox.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNTS, addPlace, admin, anonClient, cleanUp, entriesIn, hasDb, memberIds, ok, shareWith, signIn, step, tempUser, unique,
} from './helpers.js';

describe.skipIf(!hasDb)('account journeys', () => {
  let one;
  let two;

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
  });
  afterAll(() => cleanUp(one, two));

  it('sign in → edit profile → bad edits refused → put it back', async () => {
    await step('1. wrong password is refused', () => expect(signIn(ACCOUNTS.one, 'definitely-wrong')).rejects.toThrow(/failed/));

    const before = await ok(one.client.from('profiles').select('display_name, avatar').eq('id', one.userId).single());
    try {
      await step('2. change name and avatar', async () => {
        const name = `Test One ${Date.now() % 1000}`;
        await ok(one.client.from('profiles').update({ display_name: name, avatar: '🦊' }).eq('id', one.userId));
        expect(await ok(one.client.from('profiles').select('display_name, avatar').eq('id', one.userId).single()))
          .toEqual({ display_name: name, avatar: '🦊' });
      });
      await step('3. a blank name is refused', async () => {
        const { error } = await one.client.from('profiles').update({ display_name: '   ' }).eq('id', one.userId);
        expect(error).not.toBeNull();
      });
      await step("4. I can't change someone else's profile", async () => {
        const { data } = await one.client.from('profiles').update({ display_name: 'Hacked' }).eq('id', two.userId).select();
        expect(data ?? []).toHaveLength(0);
      });
    } finally {
      await ok(one.client.from('profiles').update(before).eq('id', one.userId));
    }
  });

  it.skipIf(!admin())('new account: sign up → starter collections → TBD → save a place → delete everything', async () => {
    const fresh = await tempUser('signup');
    try {
      await step('1. profile and starter collections exist', async () => {
        expect(await ok(fresh.client.from('profiles').select('avatar').eq('id', fresh.userId).single())).toEqual({ avatar: '🧪' });
        expect((await ok(fresh.client.rpc('get_user_collections'))).length).toBeGreaterThan(0);
      });
      const collectionId = await step('2. make a collection with a place', async () => {
        const id = await ok(fresh.client.rpc('create_collection', { p_name: unique('fresh'), p_emoji: '🌱' }));
        await addPlace(fresh.client, id);
        return id;
      });
      await step('3. TBD (shared reels inbox) exists, renames, and cannot be deleted', async () => {
        const [inbox] = await ok(fresh.client.from('collections').select('id, name').eq('owner_id', fresh.userId).eq('is_inbox', true));
        expect(inbox, 'a new account has no TBD collection').toBeTruthy();
        await ok(fresh.client.from('collections').update({ name: 'Inbox renamed' }).eq('id', inbox.id));
        const { data, error } = await fresh.client.from('collections').delete().eq('id', inbox.id).select();
        expect(Boolean(error) || (data ?? []).length === 0, 'TBD could be deleted: only the app hides the button').toBe(true);
      });
      await step('4. delete my account (everything)', () => ok(fresh.client.rpc('delete_user', { p_cascade_delete: true })));
      await step('5. the login and my collection are gone', async () => {
        const { data } = await admin().auth.admin.getUserById(fresh.userId);
        expect(data?.user ?? null).toBeNull();
        const { data: left } = await admin().from('collections').select('id').eq('id', collectionId);
        expect(left ?? []).toHaveLength(0);
      });
    } finally {
      await fresh.remove();
    }
  });

  it.skipIf(!admin())('deleting an account that shares a collection: "keep" leaves it for friends, "everything" removes it', async () => {
    const keeper = await tempUser('keeper');
    const leaver = await tempUser('leaver');
    try {
      const kept = await step('1. two accounts each share a collection with Test Two', async () => {
        const keepId = await ok(keeper.client.rpc('create_collection', { p_name: unique('kept'), p_emoji: '🤝' }));
        const goneId = await ok(leaver.client.rpc('create_collection', { p_name: unique('gone'), p_emoji: '💨' }));
        await addPlace(keeper.client, keepId, { name: 'Shared Spot' });
        await addPlace(leaver.client, goneId, { name: 'Leaving Spot' });
        await shareWith(keeper, two, keepId);
        await shareWith(leaver, two, goneId);
        return { keepId, goneId };
      });

      await step('2. delete with "keep shared collections"', () => ok(keeper.client.rpc('delete_user', { p_cascade_delete: false })));
      await step('3. Test Two still has the collection and its place', async () => {
        expect(await memberIds(two.client, kept.keepId), 'shared collection vanished when its owner left').toContain(two.userId);
        expect((await entriesIn(two.client, kept.keepId)).map((p) => p.name)).toContain('Shared Spot');
      });

      await step('4. delete with "everything"', () => ok(leaver.client.rpc('delete_user', { p_cascade_delete: true })));
      await step('5. that collection is gone for Test Two too', async () => {
        expect(await memberIds(two.client, kept.goneId)).toEqual([]);
      });
    } finally {
      // Test Two's leftover membership in the kept collection goes with it.
      const service = admin();
      for (const id of [keeper, leaver].map((u) => u.userId)) await service.from('collections').delete().eq('owner_id', id);
      await keeper.remove();
      await leaver.remove();
    }
  });

  it('iPhone Shortcut: get key → connect → share reels → app picks them up → reset key', async () => {
    const anon = anonClient();
    const key = await step('1. get my key', () => ok(one.client.rpc('get_shortcut_key')));
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    await step('2. the Shortcut connects with it (no login, like /api/save-reel)', async () => {
      expect(await ok(anon.rpc('mark_shortcut_connected', { p_key: key }))).toBe('connected');
    });

    const reel = `https://www.instagram.com/reel/${unique('R')}/`;
    await step('3. share a reel (the whole shared text), then the same one again', async () => {
      expect(await ok(anon.rpc('save_shared_reel', { p_key: key, p_url: `Look at this ${reel} so good` }))).toBe('saved');
      expect(await ok(anon.rpc('save_shared_reel', { p_key: key, p_url: reel }))).toBe('duplicate');
    });

    await step('4. bad keys and texts with no link are refused', async () => {
      const wrong = await anon.rpc('save_shared_reel', { p_key: 'not-a-key', p_url: reel });
      expect(wrong.error?.code).toBe('28000');
      const noLink = await anon.rpc('save_shared_reel', { p_key: key, p_url: 'no link here' });
      expect(noLink.error?.code).toBe('22023');
    });

    await step("5. only I can see my shared reels, and the app clears them once it's taken them", async () => {
      const mine = await ok(one.client.from('shared_reels').select('id, url').eq('url', reel));
      expect(mine).toHaveLength(1);
      expect(await ok(two.client.from('shared_reels').select('id').eq('url', reel))).toHaveLength(0);
      expect(await ok(two.client.from('shortcut_keys').select('key').eq('user_id', one.userId))).toHaveLength(0);
      await ok(one.client.from('shared_reels').delete().in('id', mine.map((r) => r.id)));
      expect(await ok(one.client.from('shared_reels').select('id').eq('url', reel))).toHaveLength(0);
    });

    await step('6. reset the key: the old one stops working', async () => {
      const fresh = await ok(one.client.rpc('reset_shortcut_key'));
      expect(fresh).not.toBe(key);
      expect((await anon.rpc('save_shared_reel', { p_key: key, p_url: reel })).error?.code).toBe('28000');
    });

    await step('7. signed out, nobody can read or reset keys', async () => {
      expect((await anon.rpc('get_shortcut_key')).error).not.toBeNull();
      expect((await anon.rpc('reset_shortcut_key')).error).not.toBeNull();
    });
  });
});
