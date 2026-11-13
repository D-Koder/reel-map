import test from 'node:test';
import assert from 'node:assert/strict';

// signUp.js reads Vite's import.meta.env and the Supabase client, so the file is loaded with both stubbed.
const src = (await import('node:fs')).readFileSync(new URL('./signUp.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './supabase';", 'const supabase = null;')
  .replace("import { demoDoneHere } from './demoHandoff';", 'const demoDoneHere = () => false;')
  .replace("import { deviceCountry } from './country';", 'const deviceCountry = () => "";')
  .replace("import.meta.env.VITE_GOOGLE_SIGNIN === '1'", 'false');
const { signUpAccount } = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

const clientReturning = (result, seen = {}) => ({ auth: { signUp: async (arg) => { seen.arg = arg; return result; } } });

test('a new account made after the demo carries the demo mark and the phone country', async () => {
  const seen = {};
  const out = await signUpAccount({ email: 'a@b.co', password: 'secret12', displayName: '  Sam ' }, clientReturning({ data: { user: { identities: [{}] }, session: {} }, error: null }, seen), { demoDone: true, country: 'Australia' });
  assert.deepEqual(out, { signedIn: true });
  assert.deepEqual(seen.arg.options.data, { display_name: 'Sam', avatar: '🙂', country: 'Australia', demo_done: true });
});

test('without the demo there is no demo mark', async () => {
  const seen = {};
  await signUpAccount({ email: 'a@b.co', password: 'secret12', displayName: 'Sam' }, clientReturning({ data: { user: { identities: [{}] }, session: {} }, error: null }, seen), { demoDone: false, country: '' });
  assert.equal('demo_done' in seen.arg.options.data, false);
});

test('an email that already has an account is sent to log in', async () => {
  const out = await signUpAccount({ email: 'a@b.co', password: 'secret12' }, clientReturning({ data: { user: { identities: [] }, session: null }, error: null }), { demoDone: true, country: '' });
  assert.deepEqual(out, { exists: true });
});

test('email confirmation on means no session yet, and errors come back as they are', async () => {
  assert.deepEqual(await signUpAccount({ email: 'a@b.co', password: 'x' }, clientReturning({ data: { user: { identities: [{}] }, session: null }, error: null }), { demoDone: false, country: '' }), { confirmEmail: true });
  const error = new Error('weak');
  assert.deepEqual(await signUpAccount({ email: 'a@b.co', password: 'x' }, clientReturning({ data: {}, error }), { demoDone: false, country: '' }), { error });
});
