// Google Calendar's free/busy answer for the signed-in Google account, read straight from the browser with
// Google's sign-in (the "calendar.freebusy" permission: busy and free times only, never event details).
// Nothing goes through or is saved on our server, and the access token lives in this tab's memory for the
// hour Google gives it. Needs VITE_GOOGLE_CLIENT_ID (a Google Cloud "Web application" OAuth client id).
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
// Adding events only to the app's own, separate from the free/busy permission above.
const EVENT_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

export const googleCalendarEnabled = Boolean(CLIENT_ID);

// Thrown when the person has to tap (Google's sign-in window only opens from a tap).
export class NeedsGoogleTap extends Error {}

let token = null;
let eventToken = null;
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

// Asks Google for an access token for one permission. The window opens right away, so call it straight from a tap.
function requestToken(scope, notGranted) {
  return new Promise((resolve, reject) => {
    if (!loaded()) {
      preloadGoogle();
      reject(new Error('Google sign-in is still loading. Tap again in a moment.'));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error('Google did not connect. Try again.'));
        } else if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, scope)) {
          reject(new Error(notGranted));
        } else {
          resolve({ value: response.access_token, expires: Date.now() + Number(response.expires_in || 3600) * 1000 });
        }
      },
      error_callback: (error) => reject(new Error(error?.type === 'popup_closed'
        ? 'The Google window was closed.'
        : 'Could not open Google sign-in. Is a pop-up blocker on?')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// Opens Google's sign-in and permission window. Call it straight from a tap.
export async function connectGoogleCalendar() {
  token = await requestToken(SCOPE, 'Allow "See your availability" so we can find a free time.');
}

// Takes back the permission given to this app and forgets the tokens.
export function disconnectGoogleCalendar() {
  if (loaded()) {
    if (token) window.google.accounts.oauth2.revoke(token.value, () => {});
    if (eventToken) window.google.accounts.oauth2.revoke(eventToken.value, () => {});
  }
  token = null;
  eventToken = null;
}

// Puts an event on the person's main Google Calendar. Only events this app adds: it can't read or change
// anything else (the "calendar.app.created" permission). If the person hasn't allowed that yet, Google asks
// now, so call it straight from a tap.
export async function addGoogleEvent({ title, location, description, start, minutes = 120 }) {
  if (!eventToken || eventToken.expires <= Date.now() + 60000) {
    eventToken = await requestToken(EVENT_SCOPE, 'Allow adding events so we can put this in your calendar.');
  }
  const startDate = new Date(start);
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${eventToken.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: title,
      location,
      description,
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: new Date(startDate.getTime() + minutes * 60 * 1000).toISOString() },
    }),
  });
  if (response.status === 401 || response.status === 403) {
    eventToken = null;
    throw new Error('Google did not connect. Try again.');
  }
  if (!response.ok) throw new Error('Could not add it to your Google Calendar.');
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
