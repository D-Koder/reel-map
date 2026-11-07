// First, so the old saved data is gone before any module reads it.
import './lib/wipeOnce';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { showComingSoon } from './lib/comingSoon';
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
      .then((Sentry) => Sentry.init({ dsn: sentryDsn, environment: import.meta.env.MODE, release: __APP_VERSION__.commit }))
      .catch(() => {});
  });
}

// The app itself only loads when the page isn't gated, so visitors never reach the login screen.
const root = ReactDOM.createRoot(document.getElementById('root'));
function show(Screen) {
  root.render(
    <React.StrictMode>
      <Screen />
    </React.StrictMode>
  );
}
if (showComingSoon()) import('./components/ComingSoon').then((m) => show(m.default));
else import('./App').then((m) => show(m.default));
