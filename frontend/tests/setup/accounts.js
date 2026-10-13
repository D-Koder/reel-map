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
  const password = `t-${randomBytes(18).toString('base64url')}`;
  const ids = [];
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
  process.env.TEST_RUN_PASSWORD = password;
  return async () => {
    for (const id of ids) await service.auth.admin.deleteUser(id).catch(() => {});
  };
}

// Vitest: only when database tests are part of the run.
export async function setup() {
  const args = process.argv.slice(2).join(' ');
  const onlyOtherLayers = /tests\/(unit|live)/.test(args) && !args.includes('tests/db');
  if (onlyOtherLayers) return undefined;
  return makeRunAccounts();
}
