import { apiFetch } from './api';
import { readJSON, writeJSON } from './storage';
import { googleBusy } from './googleCalendar';

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

// Google Calendar is connected on this device (the permission itself is asked again each visit, because
// Google's token only lasts an hour). Kept per person, like the link.
const googleKey = (userId) => `reelmap:calendar-google:${userId}`;

export const savedGoogleCalendar = (userId) => (userId ? readJSON(googleKey(userId), false) === true : false);

export function saveGoogleCalendar(userId, on) {
  if (on) {
    writeJSON(googleKey(userId), true);
    return;
  }
  try {
    localStorage.removeItem(googleKey(userId));
  } catch {
    // Nothing saved to remove.
  }
}

// What's connected for this person: { kind: 'google' }, { kind: 'link', link } or { kind: '' }.
export function savedConnection(userId) {
  if (savedGoogleCalendar(userId)) return { kind: 'google' };
  const link = savedCalendarLink(userId);
  return link ? { kind: 'link', link } : { kind: '' };
}

// The busy times for whatever is connected. A Google connection throws NeedsGoogleTap until it's tapped this visit.
export function busyFor(connection, from, to, signal) {
  return connection.kind === 'google' ? googleBusy(from, to, signal) : fetchBusy(connection.link, from, to, signal);
}
