// What the no-login demo hands to the account the person makes next: the collection they chose, and which steps they
// already did, so the first-run tour can skip those. It lives on this browser only (nothing is sent anywhere) and
// is removed once the account has used it. It is ignored after a week.
const KEY = 'waylit:demo';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveDemoHandoff({ collName, collEmoji, saved, booked }, storage = globalThis.localStorage, now = Date.now()) {
  if (!collName) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ v: 1, collName: String(collName).slice(0, 40), collEmoji: collEmoji || '📌', did: { saved: Boolean(saved), booked: Boolean(booked) }, at: now }));
    return true;
  } catch {
    return false; // private mode or storage full: the demo still worked, the account just starts from scratch
  }
}

export function readDemoHandoff(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || 'null');
    if (!value || value.v !== 1 || !value.collName || now - value.at > MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearDemoHandoff(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); } catch { /* nothing to clear */ }
}

// Set when the demo is finished with a booked time. It outlives the hand-off above (which is cleared once used), so the
// "Test Driver" badge can be earned by the account made next. Device only; nothing is sent anywhere.
const DONE_KEY = 'waylit:demo-done';
export function markDemoDone(storage = globalThis.localStorage) {
  try { storage.setItem(DONE_KEY, '1'); } catch { /* private mode: no badge, the demo still worked */ }
}
export function demoDoneHere(storage = globalThis.localStorage) {
  try { return storage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

// Set once someone has signed in on this device, so the main page can send them straight to Log in next time.
const ACCOUNT_KEY = 'waylit:has-account';
export function rememberAccountHere(storage = globalThis.localStorage) {
  try { storage.setItem(ACCOUNT_KEY, '1'); } catch { /* private mode */ }
}
export function hasAccountHere(storage = globalThis.localStorage) {
  try { return storage.getItem(ACCOUNT_KEY) === '1'; } catch { return false; }
}
