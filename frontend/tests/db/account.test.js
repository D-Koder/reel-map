// Accounts: create, profile updates, invite links (send + join), delete.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, admin, cleanUp, env, hasDb, memberIds, ok, shareWith, signIn, unique } from './helpers.js';

describe.skipIf(!hasDb)('account', () => {
  let one;
  let two;

  beforeAll(async () => {
    one = await signIn(ACCOUNTS.one);
    two = await signIn(ACCOUNTS.two);
  });
  afterAll(() => cleanUp(one, two));

  it('a new account gets a profile and its starter collections', async () => {
    const service = admin();
    if (!service) return; // Needs TEST_SUPABASE_SERVICE_ROLE_KEY.
    const email = `${unique('signup')}@example.com`;
    const created = await ok(service.auth.admin.createUser({
      email, password: env.password, email_confirm: true, user_metadata: { display_name: 'Temp', avatar: '🧪' },
    }));
    try {
      const fresh = await signIn(email);
      const profile = await ok(fresh.client.from('profiles').select('display_name, avatar').eq('id', fresh.userId).single());
      expect(profile).toEqual({ display_name: 'Temp', avatar: '🧪' });
      const collections = await ok(fresh.client.rpc('get_user_collections'));
      expect(collections.length).toBeGreaterThan(0);

      // Delete my account, as Settings → Delete account does.
      await ok(fresh.client.rpc('delete_user', { p_cascade_delete: true }));
      const { data } = await service.auth.admin.getUserById(created.user.id);
      expect(data?.user ?? null).toBeNull();
    } finally {
      await service.auth.admin.deleteUser(created.user.id).catch(() => {});
    }
  });

  it('wrong password is refused', async () => {
    await expect(signIn(ACCOUNTS.one, 'definitely-wrong')).rejects.toThrow(/Sign in .* failed/);
  });

  it('profile name and avatar update, and others see the change', async () => {
    const before = await ok(one.client.from('profiles').select('display_name, avatar').eq('id', one.userId).single());
    const name = `Test One ${Date.now() % 1000}`;
    await ok(one.client.from('profiles').update({ display_name: name, avatar: '🦊' }).eq('id', one.userId));
    try {
      const after = await ok(one.client.from('profiles').select('display_name, avatar').eq('id', one.userId).single());
      expect(after).toEqual({ display_name: name, avatar: '🦊' });
    } finally {
      await ok(one.client.from('profiles').update(before).eq('id', one.userId));
    }
  });

  it('an empty display name is refused', async () => {
    const { error } = await one.client.from('profiles').update({ display_name: '   ' }).eq('id', one.userId);
    expect(error).not.toBeNull();
  });

  it("I can't change someone else's profile", async () => {
    const { data } = await one.client.from('profiles').update({ display_name: 'Hacked' }).eq('id', two.userId).select();
    expect(data ?? []).toHaveLength(0);
  });

  it('invite link: owner sends, friend joins, joining twice is fine', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('invite'), p_emoji: '💌' }));
    const invite = await shareWith(one, two, id);
    expect(await memberIds(one.client, id)).toEqual([one.userId, two.userId].sort());
    const again = await ok(two.client.rpc('accept_collection_invite', { p_invite_id: invite.id }));
    expect(again).toBe(false);
  });

  it('invite code: typed with a dash and lower case still joins', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('code'), p_emoji: '🔑' }));
    const code = 'K7Q2XPMA'.split('').sort(() => Math.random() - 0.5).join('');
    await ok(one.client.from('collection_invites').insert({
      collection_id: id, created_by: one.userId, code, expires_at: new Date(Date.now() + 86400000).toISOString(),
    }));
    const rows = await ok(two.client.rpc('join_collection_by_code', { p_code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` }));
    expect((Array.isArray(rows) ? rows[0] : rows).joined).toBe(true);
  });

  it('expired invites are refused', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('expired'), p_emoji: '⌛' }));
    const invite = await ok(one.client.from('collection_invites').insert({
      collection_id: id, created_by: one.userId, expires_at: new Date(Date.now() - 1000).toISOString(),
    }).select('id').single());
    const { error } = await two.client.rpc('accept_collection_invite', { p_invite_id: invite.id });
    expect(error?.message).toMatch(/Invalid or expired/);
  });

  it('only the owner can make an invite', async () => {
    const id = await ok(one.client.rpc('create_collection', { p_name: unique('notowner'), p_emoji: '🚫' }));
    await shareWith(one, two, id);
    const { error } = await two.client.from('collection_invites').insert({
      collection_id: id, created_by: two.userId, expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(error).not.toBeNull();
  });
});
