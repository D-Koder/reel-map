// Shows how a place or a reel was found: the post, what the AI read and returned, what was searched,
// which result was picked and why, the outcome, and any reports. Reads lookup_traces with the server key.
//
//   node scripts/trace-lookup.mjs place <place id>     the trace of a saved place
//   node scripts/trace-lookup.mjs trace <trace id>     one lookup
//   node scripts/trace-lookup.mjs reel <reel link>     the latest lookups of a reel
//
// Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.
// Keep the output private: captions and logs can contain other people's details.

import { formatTrace, summaryLine } from './trace-format.mjs';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same headers as api/_lib/lookup-cache.js: new secret keys go in apikey only.
const headers = () => ({
  apikey: KEY,
  ...(KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${KEY}` }),
});

async function query(table, filter) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { headers: headers() });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
  return response.json();
}

async function main(argv) {
  const [kind, value] = argv;
  if (!SUPABASE_URL || !KEY || !['place', 'trace', 'reel'].includes(kind) || !value) {
    console.error('Usage: node scripts/trace-lookup.mjs place|trace|reel <value>  (see the top of this file)');
    process.exitCode = 1;
    return;
  }

  if (kind === 'trace') {
    if (!UUID.test(value)) throw new Error('A trace id is a UUID');
    const [row] = await query('lookup_traces', `id=eq.${value}&select=*`);
    console.log(row ? formatTrace(row) : 'No trace with that id (traces are kept 30 days).');
    return;
  }

  if (kind === 'place') {
    if (!UUID.test(value)) throw new Error('A place id is a UUID');
    const [place] = await query('places', `id=eq.${value}&select=name,lookup_trace_id`);
    if (!place) return console.log('No place with that id.');
    if (!place.lookup_trace_id) return console.log(`"${place.name}" has no lookup trace (added by hand, or its trace is older than 30 days).`);
    const [row] = await query('lookup_traces', `id=eq.${place.lookup_trace_id}&select=*`);
    console.log(`Place: ${place.name}\n`);
    console.log(row ? formatTrace(row) : 'Its trace has been deleted (traces are kept 30 days).');
    return;
  }

  // reel: the latest lookups of this link, either spelling.
  const link = encodeURIComponent(value);
  const [asShared, asClean] = await Promise.all([
    query('lookup_traces', `reel_url=eq.${link}&select=*&order=created_at.desc&limit=5`),
    query('lookup_traces', `clean_url=eq.${link}&select=*&order=created_at.desc&limit=5`),
  ]);
  const seen = new Set();
  const rows = [...asShared, ...asClean]
    .filter((row) => (seen.has(row.id) ? false : seen.add(row.id)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);
  if (!rows.length) return console.log('No lookups of that reel in the last 30 days.');
  console.log('Latest lookups (newest first). Show one with: node scripts/trace-lookup.mjs trace <id>\n');
  rows.forEach((row) => console.log(summaryLine(row)));
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
