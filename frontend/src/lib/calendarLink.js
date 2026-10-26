import { apiFetch } from './api';
import { readJSON, writeJSON } from './storage';

// A person's calendar link (Google's "secret address in iCal format", or an iCloud public calendar link),
// kept on this device only. The key ends in ":<userId>" so it's cleared with everything else when an
// account is deleted. The server reads the link once per request and doesn't keep it.
const key = (userId) => `reelmap:calendar-link:${userId}`;

export const savedCalendarLink = (userId) => (userId ? readJSON(key(userId), '') || '' : '');

export function saveCalendarLink(userId, link) {
  writeJSON(key(userId), link);
}

export function forgetCalendarLink(userId) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // Nothing saved to remove.
  }
}

// The busy times between two Dates as [{ start, end }] Dates. Throws an Error with a message to show.
export async function fetchBusy(calendarUrl, from, to, signal) {
  const response = await apiFetch('/api/calendar-busy', {
    body: JSON.stringify({ calendarUrl, from: from.toISOString(), to: to.toISOString() }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not read that calendar.');
  return (data.busy || []).map((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
}
