// Each run makes two throwaway accounts ("Test One" and "Test Two") with made-up @example.com
// emails and a random password, and deletes them at the end. Nothing real is ever emailed, and
// runs never share leftovers. The tests read them through ACCOUNTS in tests/db/helpers.js.
import { randomBytes } from 'node:crypto';

const PEOPLE = [
  { key: 'TEST_RUN_ONE', label: 'one', display_name: 'Test One', avatar: '🧪' },
  { key: 'TEST_RUN_TWO', label: 'two', display_name: 'Test Two', avatar: '🧭' },
];

export async function makeRunAccounts() {
  // Loaded here, so a run of only the quick checks never touches the database settings.
  const { admin, hasTestProject, ok, unique } = await import('../db/helpers.js');
  if (!hasTestProject) return async () => {};
  const service = admin();
  // An empty project (no Reel Map tables yet) can't run the tests: say so plainly.
  const { error: noTables } = await service.from('profiles').select('id').limit(1);
  if (noTables) {
    throw new Error(`The Supabase project in TEST_SUPABASE_URL has no Reel Map tables (${noTables.message}). `
      + 'Point the secrets at live, or build the project first (TESTING.md → One-time setup).');
  }
  await removeLeftovers(service);
  const password = `t-${randomBytes(18).toString('base64url')}`;
  const ids = [];
  const removeAll = async () => {
    for (const id of ids) await removeAccount(service, id);
  };
  try {
    for (const person of PEOPLE) {
      const email = `${unique(person.label)}@example.com`;
      const { data, error } = await service.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: person.display_name, avatar: person.avatar },
      });
      if (error) throw new Error(`Could not make the ${person.display_name} account: ${error.message}`);
      ids.push(data.user.id);
      // Streak days count in Melbourne time.
      await ok(service.from('profiles').update({ timezone: 'Australia/Melbourne' }).eq('id', data.user.id));
      process.env[person.key] = email;
    }
  } catch (error) {
    // Don't leave a half-made account behind.
    await removeAll();
    throw error;
  }
  process.env.TEST_RUN_PASSWORD = password;
  return removeAll;
}

// Deletes a throwaway account and the photos it uploaded.
async function removeAccount(service, id) {
  const { data: files } = await service.storage.from('profile-avatars').list(id);
  if (files?.length) await service.storage.from('profile-avatars').remove(files.map((f) => `${id}/${f.name}`));
  await service.auth.admin.deleteUser(id).catch(() => {});
}

// Throwaway accounts (t-…@example.com) left by a run that crashed more than an hour ago.
// Only ever these: real accounts never match.
async function removeLeftovers(service) {
  const hourAgo = Date.now() - 3600000;
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return;
    for (const user of data.users) {
      if (/^t-[\w-]+@example\.com$/.test(user.email ?? '') && Date.parse(user.created_at) < hourAgo) {
        await removeAccount(service, user.id);
      }
    }
    if (data.users.length < 200) return;
  }
}

// Vitest: only when database tests are part of the run.
export async function setup() {
  const args = process.argv.slice(2).join(' ');
  const onlyOtherLayers = /tests\/(unit|live)/.test(args) && !args.includes('tests/db');
  if (onlyOtherLayers) return undefined;
  return makeRunAccounts();
}
