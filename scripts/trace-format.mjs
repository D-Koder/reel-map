// Turns one lookup_traces row into readable text, in the order a lookup runs:
// where the reel came from, the post, what the AI read and returned, what was searched, the pick,
// the result, and any reports. Used by scripts/trace-lookup.mjs. Pure, so it can be tested.

const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}… (${text.length} characters)` : text;
};

const line = (label, value) => (value === null || value === undefined || value === '' ? null : `  ${label}: ${value}`);

const block = (title, lines) => {
  const kept = lines.filter(Boolean);
  return kept.length ? [title, ...kept, ''] : [];
};

// Each candidate on one line: name, then its address, so you can see what Google offered.
function candidateLines(candidates = []) {
  if (!candidates.length) return ['  (none)'];
  return candidates.slice(0, 10).map((candidate, index) => `  ${index + 1}. ${candidate.name || '(no name)'}${candidate.address ? ` — ${candidate.address}` : ''}`);
}

function reportLines(reports = []) {
  if (!reports.length) return [];
  return reports.map((report) => `  ${report.at || ''}${report.reason ? ` [${report.reason}]` : ''}: ${report.comment || '(no comment)'}`);
}

// The whole trace as text. `row` is one lookup_traces row, as the API returns it.
export function formatTrace(row, { maxLogLines = 40 } = {}) {
  const steps = row.steps || {};
  const ai = row.ai || null;
  const search = row.search || {};
  const result = row.result || {};
  const pick = search.pick || null;
  const logLines = String(row.logs || '').split('\n').filter(Boolean);

  const out = [
    `Lookup ${row.id}`,
    `  when: ${row.created_at}`,
    `  arrived by: ${row.entry}`,
    line('signed-in person', row.user_id),
    line('reel', row.reel_url),
    '',
    ...block('1. Where the reel came from', [
      line('read from', steps.source),
      row.from_cache ? line('saved answer used from lookup', row.origin_trace_id || 'unknown') : null,
      line('cache key', row.cache_key),
    ]),
    ...block('2. The post', [
      line('creator', row.creator),
      line('location tag', row.location_tag),
      line('post date', steps.postDate),
      row.caption ? `  caption:\n${clip(row.caption, 1500).split('\n').map((text) => `    ${text}`).join('\n')}` : line('caption', '(none)'),
    ]),
    ...block('3. What the AI read and returned', ai ? [
      line('model', ai.model),
      line('confidence', ai.answer?.confidence),
      line('kind', ai.answer?.kind),
      ai.earlierRaw ? `  first reply (before the page extras were added):\n    ${clip(ai.earlierRaw, 2000)}` : null,
      ai.raw ? `  reply:\n    ${clip(ai.raw, 4000)}` : line('reply', '(none)'),
    ] : [line('AI', steps.ai || 'not used (saved answer or no caption)')]),
    ...block('4. What was searched and picked', [
      line('search', search.query),
      `  results:\n${candidateLines(search.candidates).join('\n')}`,
      line('Google page', search.mapsPage ? clip(JSON.stringify(search.mapsPage), 500) : null),
      line('error', search.error),
      pick ? line('picked by', `${pick.by} — ${pick.reason}`) : line('picked by', 'nothing picked'),
      search.selected ? line('chosen result', `${search.selected.name || '(no name)'} ${search.selected.url || ''}`.trim()) : null,
    ]),
    ...block('5. The result', [
      line('status', result.ok ? 'ok' : 'failed'),
      line('error', result.error),
      line('place name', result.placeName),
      line('location', result.location),
      line('venue', result.venue),
      line('category', result.category),
      result.details ? line('Google details', `${result.details.name || ''} — ${result.details.address || ''} (${result.details.latitude}, ${result.details.longitude})`) : null,
      line('details error', result.detailsError),
      line('saved for others', steps.saved),
    ]),
    ...block('6. Reports from people', reportLines(row.reports)),
    ...block(`7. Server log (last ${maxLogLines} lines)`, logLines.slice(-maxLogLines).map((text) => `  ${text}`)),
  ];
  return out.filter((text, index, all) => !(text === '' && all[index - 1] === '')).join('\n');
}

// One line per trace, for a list of lookups of the same reel.
export function summaryLine(row) {
  const place = row.result?.placeName || row.search?.selected?.name || '(no place)';
  const status = row.result?.error ? 'error' : row.result?.ok ? 'ok' : 'failed';
  return `${row.created_at}  ${row.entry.padEnd(8)}  ${status.padEnd(6)}  ${place}  [${row.id}]${row.from_cache ? '  (saved answer)' : ''}`;
}
