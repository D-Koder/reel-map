// Creates two test accounts in a Supabase project.
//
// Run once against the TEST project:
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
//   TEST_ACCOUNT_PASSWORD=<password> \
//   node supabase/scripts/create-test-accounts.mjs
//
// Passwords and the service role key are read from the environment only.
// Never commit them.

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.TEST_ACCOUNT_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TEST_ACCOUNT_PASSWORD.');
  process.exit(1);
}

const accounts = [
  { email: 'test01@gmail.com', displayName: 'Test One', avatar: '🧪' },
  { email: 'test02@gmail.com', displayName: 'Test Two', avatar: '🧭' },
];

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

for (const account of accounts) {
  // Create the auth user. The existing signup trigger creates the profile row.
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: account.displayName, avatar: account.avatar },
    }),
  });
  const created = await createRes.json();

  if (!createRes.ok) {
    console.error(`${account.email}: ${created.msg ?? created.message ?? createRes.status}`);
    continue;
  }

  // Set the timezone so streak days use Melbourne time.
  const patchRes = await fetch(`${url}/rest/v1/profiles?id=eq.${created.id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ timezone: 'Australia/Melbourne' }),
  });

  if (!patchRes.ok) {
    console.error(`${account.email}: created, but could not set timezone (${patchRes.status})`);
    continue;
  }

  console.log(`Created ${account.email} (${created.id})`);
}
