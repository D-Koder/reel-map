import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
