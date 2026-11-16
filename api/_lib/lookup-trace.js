// Lookup traces (table lookup_traces, see supabase/migrations/20261118000000_lookup_traces.sql).
// One row per reel lookup: the post, what the AI read and answered, what was searched, which result was
// picked and why, and any reports from people. It is what you read to find out why a place is wrong.
// Saving a trace never fails a lookup.

const crypto = require('crypto');
const { insertRow, selectRows, patchRows } = require('./lookup-cache');

const MAX_CANDIDATES = 20;
const MAX_RAW_REPLY = 20000;
const MAX_LOGS = 50000;
const MAX_REPORTS = 20;

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const newTraceId = () => crypto.randomUUID();

const isUuid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Text kept at most `max` characters long; null when there is none.
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.slice(0, max) : null);

// How a lookup arrived: the Shortcut's background save, the reel inbox, or the app itself.
function entryFor({ background = false, from = '' } = {}) {
  if (background === true) return 'shortcut';
  if (from === 'inbox') return 'inbox';
  return 'app';
}

// Candidates as the trace keeps them: enough to see what Google offered, not the whole result.
function traceCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).slice(0, MAX_CANDIDATES)
    .map(({ name, address, category, url }) => ({ name, address, category, url }));
}

// The row for lookup_traces. `notes` is what the lookup kept on the way (set in api/enrich-reel.js):
//   notes.ai       { model, raw, answer }  the AI's model, its reply as text and what the server read from it
//   notes.pick     { by, reason }          how the place was picked, or why none was
//   notes.cache    { hit, originTraceId }  whether a saved answer was used, and the lookup that saved it
//   notes.cacheKey                         the key the saved answer is kept under
// `body` is the answer the lookup returned to the app. `error` is set when the lookup itself threw.
function buildTraceRow({ id, userId = null, entry, reelUrl, cleanUrl, notes = {}, body = {}, logs = '', error = null }) {
  const maps = body.maps || {};
  const steps = body.steps || {};
  const details = maps.details || null;
  return {
    id,
    user_id: isUuid(userId) ? userId : null,
    entry,
    reel_url: text(reelUrl, 2048),
    clean_url: text(cleanUrl, 2048),
    from_cache: Boolean(notes.cache?.hit),
    origin_trace_id: isUuid(notes.cache?.originTraceId) ? notes.cache.originTraceId : null,
    cache_key: text(notes.cacheKey, 2048),
    caption: text(body.caption, 10000),
    creator: text(body.creator, 500),
    location_tag: text(body.locationTag, 500),
    steps,
    ai: notes.ai ? {
      model: text(notes.ai.model, 100),
      raw: text(notes.ai.raw, MAX_RAW_REPLY),
      // Only when the AI was asked again with the page's extras: its first reply.
      earlierRaw: text(notes.ai.earlierRaw, MAX_RAW_REPLY),
      answer: notes.ai.answer ?? null,
    } : null,
    search: {
      query: text(maps.query, 500),
      candidates: traceCandidates(maps.candidates),
      selected: maps.selectedCandidate
        ? { name: maps.selectedCandidate.name || null, url: maps.selectedCandidate.url || null }
        : null,
      pick: notes.pick || null,
      error: text(maps.error, 500),
      mapsPage: steps.mapsPage ?? null,
    },
    result: {
      ok: body.success !== false && !error,
      unreadable: Boolean(body.unreadable),
      placeName: text(body.placeName, 200),
      location: text(body.location, 500),
      venue: text(body.venue, 500),
      category: text(body.category, 50),
      saved: steps.saved || null,
      details: details ? {
        name: text(details.name, 200),
        address: text(details.address, 500),
        latitude: details.latitude ?? null,
        longitude: details.longitude ?? null,
        mapsUrl: text(details.mapsUrl, 2048),
      } : null,
      detailsError: text(maps.detailsError, 500),
      error: text(error, 500),
    },
    logs: text(logs, MAX_LOGS),
    reports: [],
  };
}

// Saves a trace. Never throws: the lookup's answer goes back whether or not the trace is kept.
async function saveTrace(row) {
  await insertRow('lookup_traces', row);
}

// Adds a report from a person to a trace, so it is read with the lookup that made the place.
async function addReport(traceId, report) {
  if (!isUuid(traceId)) return false;
  const [trace] = await selectRows('lookup_traces', `id=eq.${traceId}`, 'reports');
  if (!trace) return false;
  const reports = [...(Array.isArray(trace.reports) ? trace.reports : []), report].slice(-MAX_REPORTS);
  return patchRows('lookup_traces', `id=eq.${traceId}`, { reports });
}

// The trace of a saved place, read with the person's own sign-in, so only places they can see are found.
// Null when there is none, or when the person can't see the place.
async function placeTraceId(accessToken, placeId) {
  if (!isUuid(placeId) || !accessToken || !SUPABASE_URL || !ANON_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${placeId}&select=lookup_trace_id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const [place] = await response.json();
    return isUuid(place?.lookup_trace_id) ? place.lookup_trace_id : null;
  } catch (error) {
    console.warn('Place trace lookup failed:', error.message);
    return null;
  }
}

module.exports = { newTraceId, isUuid, entryFor, buildTraceRow, saveTrace, addReport, placeTraceId, MAX_LOGS };
