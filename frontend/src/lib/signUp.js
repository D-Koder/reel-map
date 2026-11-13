import { supabase } from './supabase';
import { demoDoneHere } from './demoHandoff';
import { deviceCountry } from './country';

// Shown only once Google is switched on in Supabase (Authentication > Providers) and VITE_GOOGLE_SIGNIN=1 is set.
export const GOOGLE_SIGNIN = import.meta.env.VITE_GOOGLE_SIGNIN === '1';

// Makes an account. Used by the sign-up screen and by the demo's end card, so both do exactly the same thing:
//   the person's country is the phone's region, everyone starts with the Waylit lantern avatar, and an account made
//   straight after the no-login demo carries demo_done (the Test Driver badge; see 20261113000100_demo_badge.sql).
// Returns one of: { error }, { exists: true }, { confirmEmail: true }, { signedIn: true }.
export async function signUpAccount({ email, password, displayName }, client = supabase, { demoDone = demoDoneHere(), country = deviceCountry() } = {}) {
  const res = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: String(displayName ?? '').trim(), avatar: '🙂', country, ...(demoDone ? { demo_done: true } : {}) } },
  });
  if (res.error) return { error: res.error };
  // An email that already has an account comes back with no identities (and no error, so nobody can probe for emails).
  // The Test Driver badge is only for new accounts, so these people are sent to Log in.
  if (res.data.user && (res.data.user.identities ?? []).length === 0) return { exists: true };
  // With "Confirm email" switched on there is no session until the link is clicked.
  if (!res.data.session) return { confirmEmail: true };
  return { signedIn: true };
}

// Comes back to this exact address, so an invite link (?invite=) still joins the collection.
export async function signInWithGoogle(client = supabase) {
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  return { error };
}
