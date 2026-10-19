import { supabase } from './supabase';

// POSTs JSON to one of our /api endpoints as the signed-in person, so the server knows the
// lookup is from a real account (see api/_lib/auth.js). Takes fetch's options, minus method and headers.
export async function apiFetch(path, options = {}) {
  const { data } = (await supabase?.auth.getSession()) || {};
  const token = data?.session?.access_token;
  return fetch(path, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
