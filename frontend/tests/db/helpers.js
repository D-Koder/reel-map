// Shared set-up for the database tests. They run against the TEST Supabase project only,
// signed in as the two test accounts made by supabase/scripts/create-test-accounts.mjs.
//
// Needs (in frontend/.env.test.local or the shell, never committed):
//   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_ACCOUNT_PASSWORD
//   TEST_SUPABASE_SERVICE_ROLE_KEY  (only for the account create/delete test)
// Without them every database test is skipped.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Same guard as reset-test-project.sh: never touch the live project.
const LIVE_PROJECT_REF = 'bxkiuaapyiflnmqhodgm';

// .env.test.local holds the test secrets; .env.local is read too, for VITE_MAPBOX_TOKEN.
function loadEnvFile(name) {
  try {
    const text = readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // No file: use the shell's variables.
  }
}
loadEnvFile('.env.test.local');
loadEnvFile('.env.local');

export const env = {
  url: process.env.TEST_SUPABASE_URL,
  anonKey: process.env.TEST_SUPABASE_ANON_KEY,
  serviceKey: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
  password: process.env.TEST_ACCOUNT_PASSWORD,
  mapbox: process.env.VITE_MAPBOX_TOKEN,
};

export const hasDb = Boolean(env.url && env.anonKey && env.password);
if (hasDb && env.url.includes(LIVE_PROJECT_REF)) {
  throw new Error(`TEST_SUPABASE_URL points at the live project (${LIVE_PROJECT_REF}). Use the test project.`);
}

export const ACCOUNTS = { one: 'test01@gmail.com', two: 'test02@gmail.com' };

const newClient = (key = env.anonKey) => createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });

export async function signIn(email, password = env.password) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign in as ${email} failed: ${error.message}`);
  return { client, userId: data.user.id, email };
}

export const admin = () => (env.serviceKey ? newClient(env.serviceKey) : null);

// Throws with the database message, so a failed step says why.
export async function ok(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

// A name no other run uses, so leftovers from a crashed run never clash.
export const unique = (label) => `t-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const addPlace = (client, collectionId, patch = {}) => ok(client.rpc('add_place_to_collection', {
  p_collection_id: collectionId,
  p_name: patch.name ?? unique('place'),
  p_category: patch.category ?? 'food',
  p_lat: patch.lat ?? -37.8155,
  p_lng: patch.lng ?? 144.9714,
  p_address: patch.address ?? '33 Russell St, Melbourne VIC 3000',
  p_hours: null,
  p_phone: null,
  p_booking_url: null,
  p_reel_url: patch.reelUrl ?? null,
  p_reel_thumbnail_url: null,
  p_source: 'manual',
  p_source_id: null,
  p_custom_info: patch.note ?? null,
  p_url: null,
}));

// Owner makes an invite (as the Share sheet does) and the other account joins with it.
export async function shareWith(owner, joiner, collectionId) {
  const invite = await ok(owner.client.from('collection_invites').insert({
    collection_id: collectionId,
    created_by: owner.userId,
    code: Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, 'X'),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }).select('id, code').single());
  await ok(joiner.client.rpc('accept_collection_invite', { p_invite_id: invite.id }));
  return invite;
}

export async function memberIds(client, collectionId) {
  const rows = await ok(client.from('collection_members').select('user_id').eq('collection_id', collectionId));
  return rows.map((r) => r.user_id).sort();
}

// Deletes every collection this account owns whose name starts with "t-" (made by these tests).
export async function cleanUp(...users) {
  for (const user of users) {
    if (!user) continue;
    await user.client.from('collections').delete().eq('owner_id', user.userId).like('name', 't-%');
  }
}

// The places in one collection as the app shows them: one entry per collection, with its own name,
// category, event day, votes ({ userId: feeling }) and booking. Read straight from the tables.
export async function entriesIn(client, collectionId) {
  const [rows, votes, bookings] = await Promise.all([
    ok(client.from('collection_places')
      .select('place_id, collection_id, custom_name, category, event_date, place:places(id, name, lat, lng)')
      .eq('collection_id', collectionId)),
    ok(client.from('reactions').select('place_id, user_id, feeling').eq('collection_id', collectionId)),
    ok(client.from('bookings').select('place_id, planned_at, done_at').eq('collection_id', collectionId)),
  ]);
  return rows.map((row) => ({
    id: row.place_id,
    collection_id: row.collection_id,
    name: row.custom_name ?? row.place?.name,
    category: row.category,
    event_date: row.event_date,
    lat: row.place?.lat,
    lng: row.place?.lng,
    reactions: Object.fromEntries(votes.filter((v) => v.place_id === row.place_id).map((v) => [v.user_id, v.feeling])),
    booking: bookings.find((b) => b.place_id === row.place_id) ?? null,
  }));
}
