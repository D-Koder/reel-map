// Account journeys: sign up → profile → delete, deleting an account that shares collections,
// and the iPhone Shortcut inbox.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNTS, addPlace, admin, anonClient, cleanUp, entriesIn, hasDb, memberIds, ok, shareWith, signIn, step, tempUser, unique,
} from './helpers.js';

describe.skipIf(!hasDb)('Account', () => {
  let one;
  let two;

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
  });
  afterAll(() => cleanUp(one, two));

  it('Log in and edit my profile', async () => {
    await step("I can't log in with the wrong password", () => expect(signIn(ACCOUNTS.one, 'definitely-wrong')).rejects.toThrow(/failed/));

    const before = await ok(one.client.from('profiles').select('display_name, avatar').eq('id', one.userId).single());
    try {
      await step('I change my name and avatar', async () => {
        const name = `Test One ${Date.now() % 1000}`;
        await ok(one.client.from('profiles').update({ display_name: name, avatar: '🦊' }).eq('id', one.userId));
        expect(await ok(one.client.from('profiles').select('display_name, avatar').eq('id', one.userId).single()))
          .toEqual({ display_name: name, avatar: '🦊' });
      });
      await step("I can't save a blank name", async () => {
        const { error } = await one.client.from('profiles').update({ display_name: '   ' }).eq('id', one.userId);
        expect(error).not.toBeNull();
      });
      await step("I can't change someone else's profile", async () => {
        const { data } = await one.client.from('profiles').update({ display_name: 'Hacked' }).eq('id', two.userId).select();
        expect(data ?? []).toHaveLength(0);
      });
    } finally {
      await ok(one.client.from('profiles').update(before).eq('id', one.userId));
    }
  });

  it.skipIf(!admin())('Sign up and delete my account', async () => {
    const fresh = await tempUser('signup', { country: 'Australia' });
    try {
      await step('I sign up and see my profile, country and starter collections', async () => {
        expect(await ok(fresh.client.from('profiles').select('avatar, country').eq('id', fresh.userId).single())).toEqual({ avatar: '🧪', country: 'Australia' });
        expect((await ok(fresh.client.rpc('get_user_collections'))).length).toBeGreaterThan(0);
      });
      const collectionId = await step('I make a collection with a place', async () => {
        const id = await ok(fresh.client.rpc('create_collection', { p_name: unique('fresh'), p_emoji: '🌱' }));
        await addPlace(fresh.client, id);
        return id;
      });
      await step('I tap "Add sample places" and my empty account fills up', async () => {
        const before = await ok(fresh.client.from('collection_places').select('place_id'));
        await ok(fresh.client.rpc('create_sample_data'));
        const after = await ok(fresh.client.from('collection_places').select('place_id'));
        expect(after.length).toBeGreaterThan(before.length);
      });
      await step("I see TBD and can rename it, but can't delete it (known bug)", async () => {
        const [inbox] = await ok(fresh.client.from('collections').select('id, name').eq('owner_id', fresh.userId).eq('is_inbox', true));
        expect(inbox, 'a new account has no TBD collection').toBeTruthy();
        await ok(fresh.client.from('collections').update({ name: 'Inbox renamed' }).eq('id', inbox.id));
        const { data, error } = await fresh.client.from('collections').delete().eq('id', inbox.id).select();
        expect(Boolean(error) || (data ?? []).length === 0, 'TBD could be deleted: only the app hides the button').toBe(true);
      });
      await step('I delete my account and everything in it', () => ok(fresh.client.rpc('delete_user', { p_cascade_delete: true })));
      await step('I see my login and my collection are gone', async () => {
        const { data } = await admin().auth.admin.getUserById(fresh.userId);
        expect(data?.user ?? null).toBeNull();
        const { data: left } = await admin().from('collections').select('id').eq('id', collectionId);
        expect(left ?? []).toHaveLength(0);
      });
    } finally {
      await fresh.remove();
    }
  });

  it.skipIf(!admin())('Delete an account that shares a collection', async () => {
    const keeper = await tempUser('keeper');
    const leaver = await tempUser('leaver');
    try {
      const kept = await step('Two other accounts each share a collection with Test Two', async () => {
        const keepId = await ok(keeper.client.rpc('create_collection', { p_name: unique('kept'), p_emoji: '🤝' }));
        const goneId = await ok(leaver.client.rpc('create_collection', { p_name: unique('gone'), p_emoji: '💨' }));
        await addPlace(keeper.client, keepId, { name: 'Shared Spot' });
        await addPlace(leaver.client, goneId, { name: 'Leaving Spot' });
        await shareWith(keeper, two, keepId);
        await shareWith(leaver, two, goneId);
        return { keepId, goneId };
      });

      await step('The first deletes their account with "Keep shared collections"', () => ok(keeper.client.rpc('delete_user', { p_cascade_delete: false })));
      await step('Test Two still has that collection and its place (known bug)', async () => {
        expect(await memberIds(two.client, kept.keepId), 'shared collection vanished when its owner left').toContain(two.userId);
        expect((await entriesIn(two.client, kept.keepId)).map((p) => p.name)).toContain('Shared Spot');
      });

      await step('The second deletes their account with "Everything"', () => ok(leaver.client.rpc('delete_user', { p_cascade_delete: true })));
      await step('Test Two no longer has the second collection', async () => {
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

  it('Save reels with the iPhone Shortcut', async () => {
    const anon = anonClient();
    const key = await step('I get my Shortcut key', () => ok(one.client.rpc('get_shortcut_key')));
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    await step('My Shortcut connects with the key, no login needed', async () => {
      expect(await ok(anon.rpc('mark_shortcut_connected', { p_key: key }))).toBe('connected');
    });

    const reel = `https://www.instagram.com/reel/${unique('R')}/`;
    await step('I share a reel, then the same reel again', async () => {
      expect(await ok(anon.rpc('save_shared_reel', { p_key: key, p_url: `Look at this ${reel} so good` }))).toBe('saved');
      expect(await ok(anon.rpc('save_shared_reel', { p_key: key, p_url: reel }))).toBe('duplicate');
    });

    await step('I see bad keys and texts without a link refused', async () => {
      const wrong = await anon.rpc('save_shared_reel', { p_key: 'not-a-key', p_url: reel });
      expect(wrong.error?.code).toBe('28000');
      const noLink = await anon.rpc('save_shared_reel', { p_key: key, p_url: 'no link here' });
      expect(noLink.error?.code).toBe('22023');
    });

    await step('Only I see my shared reels, and the app clears them once taken', async () => {
      const mine = await ok(one.client.from('shared_reels').select('id, url').eq('url', reel));
      expect(mine).toHaveLength(1);
      expect(await ok(two.client.from('shared_reels').select('id').eq('url', reel))).toHaveLength(0);
      expect(await ok(two.client.from('shortcut_keys').select('key').eq('user_id', one.userId))).toHaveLength(0);
      await ok(one.client.from('shared_reels').delete().in('id', mine.map((r) => r.id)));
      expect(await ok(one.client.from('shared_reels').select('id').eq('url', reel))).toHaveLength(0);
    });

    await step('I reset my key and the old one stops working', async () => {
      const fresh = await ok(one.client.rpc('reset_shortcut_key'));
      expect(fresh).not.toBe(key);
      expect((await anon.rpc('save_shared_reel', { p_key: key, p_url: reel })).error?.code).toBe('28000');
    });

    await step("A logged-out visitor can't read or reset keys", async () => {
      expect((await anon.rpc('get_shortcut_key')).error).not.toBeNull();
      expect((await anon.rpc('reset_shortcut_key')).error).not.toBeNull();
    });
  });
});
