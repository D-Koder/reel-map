// Deletes one saved place and the data that points at it, then prints the reel link it came from.
//
//   node scripts/delete-place.mjs "<name, address or caption text>"                 dry run: lists matches, changes nothing
//   node scripts/delete-place.mjs "<text>" --pick <place id>                       dry run of one match
//   node scripts/delete-place.mjs "<text>" --pick <place id> --yes                 deletes it
// With one match, it is picked. With more than one, nothing is deleted until --pick names one of them.
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

// Places whose name, address, custom info, or the caption of the lookup that found them contains `text`.
// Returns [{ id, name, address, reelUrl }], newest first.
export async function findPlaces(text, { url, key, fetchImpl = fetch } = {}) {
  const needle = String(text || '').replace(/[*%]/g, ' ').trim();
  if (needle.length < 2) throw new Error('Give at least 2 characters of the name, address or caption');
  const base = url.replace(/\/$/, '');
  const headers = {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
  };
  const get = async (path) => {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, { headers });
    if (!response.ok) throw new Error(`GET ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.json();
  };
  const pattern = encodeURIComponent(`*${needle}*`);
  const select = 'id,name,address,reel_url,created_at';

  const [byName, byAddress, byInfo, byCaption] = await Promise.all([
    get(`places?name=ilike.${pattern}&select=${select}`),
    get(`places?address=ilike.${pattern}&select=${select}`),
    get(`places?custom_info=ilike.${pattern}&select=${select}`),
    get(`lookup_traces?caption=ilike.${pattern}&select=id`),
  ]);

  // Places found through a caption: the ones whose lookup trace has that caption.
  const traceIds = byCaption.map((row) => row.id);
  const byTrace = traceIds.length
    ? await get(`places?lookup_trace_id=in.(${traceIds.join(',')})&select=${select}`)
    : [];

  const seen = new Map();
  for (const row of [...byName, ...byAddress, ...byInfo, ...byTrace]) {
    if (!seen.has(row.id)) seen.set(row.id, { id: row.id, name: row.name, address: row.address, reelUrl: row.reel_url, createdAt: row.created_at });
  }
  return [...seen.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function main(argv) {
  const pick = argv.includes('--pick') ? argv[argv.indexOf('--pick') + 1] : null;
  const text = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--pick').join(' ');
  const apply = argv.includes('--yes');
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!text || !url || !key) {
    console.error('Usage: node scripts/delete-place.mjs "<name, address or caption text>" [--pick <place id>] [--yes]');
    process.exitCode = 1;
    return;
  }

  const matches = await findPlaces(text, { url, key });
  if (!matches.length) {
    console.log(JSON.stringify({ dryRun: !apply, matches: [], deleted: {} }, null, 2));
    console.error(`No place matches "${text}".`);
    return;
  }
  if (matches.length > 1 && !pick) {
    // Never delete when the text could mean more than one place: show the choices and stop.
    console.log(JSON.stringify({ dryRun: true, matches, deleted: {} }, null, 2));
    console.error(`${matches.length} places match "${text}". Run again with --pick <place id> to choose one.`);
    return;
  }
  const placeId = pick || matches[0].id;
  if (pick && !matches.some((m) => m.id === pick)) throw new Error('--pick must be one of the matching places');

  const result = await deletePlace(placeId, { apply, url, key });
  console.log(JSON.stringify({ ...result, matches }, null, 2));
  console.error(summary(result));
}

// Run from the command line only, not when imported by the test.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
