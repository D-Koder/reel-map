// Error reporting glue. Sentry loads after the page does (see main.jsx), so anything asked of it before then
// waits here. Only an id is ever attached to a report: never an email address or name.
let sentry = null;
let pendingUser;

export function attachSentry(module) {
  sentry = module;
  if (pendingUser !== undefined) setSentryUser(pendingUser);
}

// Tags later reports with the signed-in person's id (null when they sign out).
export function setSentryUser(id) {
  pendingUser = id ?? null;
  try {
    sentry?.setUser(id ? { id } : null);
  } catch {
    // Reporting must never break the app.
  }
}

// An error the app could not recover from (see ErrorBoundary).
export function reportCrash(error, info) {
  try {
    sentry?.captureException(error, { extra: { componentStack: info?.componentStack } });
  } catch {
    // Nothing more to do.
  }
}
