// First, so the old saved data is gone before any module reads it.
import './lib/wipeOnce';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { showComingSoon } from './lib/comingSoon';
import { attachSentry } from './lib/sentry';
import ErrorBoundary from './components/ErrorBoundary';
import './components/ComingSoon.css';
import { keepFocusedFieldVisible, trackVisibleViewport } from './lib/viewport';

trackVisibleViewport();
keepFocusedFieldVisible();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Error reports to Sentry, only when VITE_SENTRY_DSN is set. Loaded once the page has loaded, so it
// doesn't slow the first load; errors before then aren't reported.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  window.addEventListener('load', () => {
    import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn: sentryDsn,
          // VITE_SENTRY_ENV names where this build runs (production, staging), so reports can be told apart.
          environment: import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE,
          release: __APP_VERSION__.commit,
          sendDefaultPii: false,
          tracesSampleRate: 0,
          // Everyday noise that isn't a bug in the app: a flaky connection, a cancelled request, browser quirks.
          ignoreErrors: [
            'ResizeObserver loop',
            'Non-Error promise rejection captured',
            'Failed to fetch',
            'NetworkError',
            'Load failed',
            'AbortError',
            'The operation was aborted',
          ],
          denyUrls: [/^chrome-extension:/i, /^safari-extension:/i, /^moz-extension:/i],
          beforeSend(event) {
            // Keep page addresses free of invite codes and shared links, and never send an email or IP address.
            if (event.request?.url) event.request.url = event.request.url.split('?')[0];
            if (event.user) event.user = { id: event.user.id };
            return event;
          },
        });
        attachSentry(Sentry);
      })
      .catch(() => {});
  });
}

// The app itself only loads when the page isn't gated, so visitors never reach the login screen.
const root = ReactDOM.createRoot(document.getElementById('root'));
function show(Screen) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <Screen />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
if (showComingSoon()) import('./components/ComingSoon').then((m) => show(m.default));
else import('./App').then((m) => show(m.default));
