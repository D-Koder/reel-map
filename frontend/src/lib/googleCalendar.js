// Google Calendar's free/busy answer for the signed-in Google account, read straight from the browser with
// Google's sign-in (the "calendar.freebusy" permission: busy and free times only, never event details).
// Nothing goes through or is saved on our server, and the access token lives in this tab's memory for the
// hour Google gives it. Needs VITE_GOOGLE_CLIENT_ID (a Google Cloud "Web application" OAuth client id).
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';

export const googleCalendarEnabled = Boolean(CLIENT_ID);

// Thrown when the person has to tap (Google's sign-in window only opens from a tap).
export class NeedsGoogleTap extends Error {}

let token = null;
export const haveGoogleToken = () => Boolean(token && token.expires > Date.now() + 60000);

let loading = null;
const loaded = () => Boolean(window.google?.accounts?.oauth2);

// Loads Google's sign-in script ahead of the tap: opening its window after waiting for a download would
// be blocked by the browser as not coming from the tap.
export function preloadGoogle() {
  if (!googleCalendarEnabled || loaded() || loading) return;
  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.async = true;
    el.onload = resolve;
    el.onerror = () => { loading = null; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(el);
  });
  loading.catch(() => {});
}

// Opens Google's sign-in and permission window. Call it straight from a tap.
export function connectGoogleCalendar() {
  return new Promise((resolve, reject) => {
    if (!loaded()) {
      preloadGoogle();
      reject(new Error('Google sign-in is still loading. Tap again in a moment.'));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error('Google did not connect. Try again.'));
        } else if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
          reject(new Error('Allow "See your availability" so we can find a free time.'));
        } else {
          token = { value: response.access_token, expires: Date.now() + Number(response.expires_in || 3600) * 1000 };
          resolve();
        }
      },
      error_callback: (error) => reject(new Error(error?.type === 'popup_closed'
        ? 'The Google window was closed.'
        : 'Could not open Google sign-in. Is a pop-up blocker on?')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// Takes back the permission given to this app and forgets the token.
export function disconnectGoogleCalendar() {
  if (token && loaded()) window.google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
}

// The busy times between two Dates as [{ start, end }] Dates, from the main calendar.
export async function googleBusy(from, to, signal) {
  if (!haveGoogleToken()) throw new NeedsGoogleTap();
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] }),
  });
  if (response.status === 401 || response.status === 403) {
    token = null;
    throw new NeedsGoogleTap();
  }
  if (!response.ok) throw new Error('Could not read your Google Calendar.');
  const data = await response.json();
  const calendar = data.calendars?.primary;
  if (!calendar || calendar.errors?.length) throw new Error('Could not read your Google Calendar.');
  return (calendar.busy || []).map((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
}
