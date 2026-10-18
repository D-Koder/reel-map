// Google Maps lookups through /api/scrape-location (see api/scrape-location.js).
// { action: 'search', query } lists matching places; { action: 'details', placeUrl, ... } reads one.
export async function requestLocationApi(payload) {
  const response = await fetch('/api/scrape-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Google Maps returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
