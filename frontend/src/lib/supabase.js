import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The API address looks like https://<project-ref>.supabase.co — not the dashboard link.
export const configError = !url || !key
  ? 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in frontend/.env.local'
  : !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
    ? `VITE_SUPABASE_URL should be your project's API URL (https://<project-ref>.supabase.co), not "${url}"`
    : null;

export const supabase = configError ? null : createClient(url, key);
