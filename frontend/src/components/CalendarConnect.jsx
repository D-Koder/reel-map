import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { fetchBusy, forgetCalendarLink, saveCalendarLink } from '../lib/calendarLink';

// Connect or disconnect the person's calendar, so "Check Hours" can suggest a time they're free.
// The link stays on this device (lib/calendarLink.js). onChange(link) hears the new link, or '' once disconnected.
export default function CalendarConnect({ userId, link, onChange }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const connect = async () => {
    const pasted = text.trim();
    if (!pasted) return;
    setChecking(true);
    setError('');
    try {
      // Reading the next day proves the link works before it's kept.
      await fetchBusy(pasted, new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000));
      saveCalendarLink(userId, pasted);
      onChange(pasted);
      setOpen(false);
      setText('');
    } catch (failure) {
      setError(failure.message);
    }
    setChecking(false);
  };

  const disconnect = () => {
    forgetCalendarLink(userId);
    onChange('');
  };

  if (link) {
    return (
      <div className="calendar-connect">
        <span className="calendar-connected"><CalendarDays className="ico" aria-hidden="true" /> Calendar connected</span>
        <button type="button" className="calendar-link-btn" onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="calendar-connect">
      {!open ? (
        <button type="button" className="step-btn secondary full-width" onClick={() => setOpen(true)}>
          <CalendarDays className="ico" aria-hidden="true" /> Connect your calendar
        </button>
      ) : (
        <>
          <input
            type="url"
            className="step-input"
            placeholder="Paste your calendar link"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <details className="calendar-help">
            <summary>Where do I find the link?</summary>
            <p><b>Google Calendar</b> (on a computer): Settings → pick your calendar → "Secret address in iCal format".</p>
            <p><b>Apple Calendar</b>: Calendars → ⓘ next to your calendar → turn on Public Calendar → Share Link.</p>
            <p>Treat the link like a password. It stays on this device, and we only read your busy times, never the event details.</p>
          </details>
          {error && <div className="calendar-error">{error}</div>}
          <div className="step-buttons">
            <button type="button" className="step-btn primary" onClick={connect} disabled={checking || !text.trim()}>
              {checking ? <><span className="spinner" aria-hidden="true" />Checking…</> : 'Connect'}
            </button>
            <button type="button" className="step-btn secondary" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
