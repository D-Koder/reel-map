// Deletes one saved place and the data that points at it, then prints the reel link it came from.
//
//   node scripts/delete-place.mjs <place id>          dry run: shows what would be deleted, changes nothing
//   node scripts/delete-place.mjs <place id> --yes    deletes it
//
// Deletes: the place, its entries in every collection, its bookings and reactions, notifications that
// point at it, the saved answer for its reel (reel_lookups), and its lookup trace (lookup_traces).
// Keeps: venues (other people may use them), other people's places, and the reel's place details cache.
// Output is JSON: { dryRun, placeId, name, reelUrl, deleted: { table: count } }.
//
// Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.
// Only run it against the project you mean to change.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The reel's clean link, the same one the lookup caches under: no ?igsh= or other query, trailing slash kept.
export function cleanReelUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    if (!/instagram\.com$/i.test(parsed.hostname.replace(/^www\./, ''))) return null;
    const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
}

// Plain-text summary for a person reading the result.
export function summary(result) {
  const verb = result.dryRun ? 'Would delete' : 'Deleted';
  const parts = Object.entries(result.deleted).map(([table, count]) => `${table}: ${count}`).join(', ');
  return `${verb} "${result.name ?? result.placeId}". ${parts}. Reel: ${result.reelUrl ?? 'none'}`;
}

export async function deletePlace(placeId, { apply = false, url, key, fetchImpl = fetch } = {}) {
  if (!UUID.test(placeId || '')) throw new Error('A place id is a UUID');
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const base = url.replace(/\/$/, '');
  const headers = {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
  };

  async function call(method, path, prefer) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
    });
    if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.json();
  }

  // The place first: if it's not there, nothing is touched.
  const [place] = await call('GET', `places?id=eq.${placeId}&select=id,name,reel_url,lookup_trace_id`);
  if (!place) return { dryRun: !apply, placeId, name: null, reelUrl: null, deleted: {} };

  const reelUrl = place.reel_url || null;
  const cleanUrl = cleanReelUrl(reelUrl);
  const counts = {};

  // Each step: the rows that match, then (with --yes) the delete itself.
  const steps = [
    ['notifications', `notifications?place_id=eq.${placeId}`],
    ['reactions', `reactions?place_id=eq.${placeId}`],
    ['bookings', `bookings?place_id=eq.${placeId}`],
    ['collection_places', `collection_places?place_id=eq.${placeId}`],
    ['places', `places?id=eq.${placeId}`],
  ];
  if (place.lookup_trace_id) steps.push(['lookup_traces', `lookup_traces?id=eq.${place.lookup_trace_id}`]);
  if (cleanUrl) steps.push(['reel_lookups', `reel_lookups?key=like.${encodeURIComponent(cleanUrl)}*`]);

  for (const [table, filter] of steps) {
    if (apply) {
      const removed = await call('DELETE', filter, 'return=representation');
      counts[table] = removed.length;
    } else {
      const found = await call('GET', `${filter}&select=*`);
      counts[table] = found.length;
    }
  }

  return { dryRun: !apply, placeId, name: place.name, reelUrl, deleted: counts };
}

async function main(argv) {
  const placeId = argv.find((arg) => !arg.startsWith('--'));
  const apply = argv.includes('--yes');
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!placeId) {
    console.error('Usage: node scripts/delete-place.mjs <place id> [--yes]');
    process.exitCode = 1;
    return;
  }
  const result = await deletePlace(placeId, { apply, url, key });
  console.log(JSON.stringify(result, null, 2));
  console.error(summary(result));
}

// Run from the command line only, not when imported by the test.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
