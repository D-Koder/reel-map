// Shared lookup cache in Supabase (tables reel_lookups and place_lookups, see
// supabase/migrations/20261014090000_lookup_cache.sql). Only the server can read or write it,
// using SUPABASE_SERVICE_ROLE_KEY. Without that key every call is a no-op and lookups run as before.
// Cache failures never fail a lookup: they are logged and treated as a miss.

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DAY = 24 * 60 * 60 * 1000;

const enabled = () => Boolean(SUPABASE_URL && SERVICE_KEY);

// Works with the newer secret key (sb_secret_…), which goes in apikey only,
// and the legacy service_role key (eyJ…), which also goes in Authorization.
function headers(extra = {}) {
  const auth = SERVICE_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` };
  return { apikey: SERVICE_KEY, ...auth, 'Content-Type': 'application/json', ...extra };
}

// The saved data for `key`, or null when it is missing or older than `maxAgeDays`.
// Also returns how old it is, so a caller can refresh parts that expire sooner (like cover links).
async function readCache(table, key, maxAgeDays) {
  if (!enabled() || !key) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}?key=eq.${encodeURIComponent(key)}&select=data,updated_at&limit=1`;
    const response = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const [row] = await response.json();
    if (!row) return null;
    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    if (ageMs > maxAgeDays * DAY) return null;
    return { data: row.data, ageMs };
  } catch (error) {
    console.warn(`Cache read from ${table} failed:`, error.message);
    return null;
  }
}

async function writeCache(table, key, data) {
  if (!enabled() || !key) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=key`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key, data, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.warn(`Cache write to ${table} failed:`, error.message);
  }
}

// Adds one row to a table, e.g. lookup_debug. Failures are logged, never thrown.
async function insertRow(table, row) {
  if (!enabled()) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    console.warn(`Insert into ${table} failed:`, error.message);
    return false;
  }
}

// Adds a lookup_debug row. If it fails with the logs (e.g. the logs column isn't there yet),
// it is saved again without them, so the row itself is never lost.
async function insertDebugRow(row) {
  if (await insertRow('lookup_debug', row) || !row.logs) return;
  await insertRow('lookup_debug', { ...row, logs: undefined });
}

module.exports = { readCache, writeCache, insertRow, insertDebugRow, DAY };
