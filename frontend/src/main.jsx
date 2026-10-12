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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
