import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { fetchBusy, forgetCalendarLink, saveCalendarLink, saveGoogleCalendar } from '../lib/calendarLink';
import { connectGoogleCalendar, disconnectGoogleCalendar, googleCalendarEnabled, preloadGoogle } from '../lib/googleCalendar';

// Connect or disconnect the person's calendar, so "Check Hours" can suggest a time they're free.
// Google Calendar is one tap (lib/googleCalendar.js); any other calendar (Apple's, say) is a pasted link that
// stays on this device (lib/calendarLink.js). onChange(connection) hears { kind: 'google' }, { kind: 'link', link }
// or { kind: '' } once disconnected. needsTap: Google is connected but its window hasn't been opened this visit.
export default function CalendarConnect({ userId, connection, needsTap, onChange }) {
  const [linkOpen, setLinkOpen] = useState(!googleCalendarEnabled);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { preloadGoogle(); }, []);

  const google = async () => {
    setError('');
    try {
      await connectGoogleCalendar();
      saveGoogleCalendar(userId, true);
      forgetCalendarLink(userId);
      onChange({ kind: 'google' });
    } catch (failure) {
      setError(failure.message);
    }
  };

  const connectLink = async () => {
    const pasted = text.trim();
    if (!pasted) return;
    setBusy(true);
    setError('');
    try {
      // Reading the next day proves the link works before it's kept.
      await fetchBusy(pasted, new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000));
      saveCalendarLink(userId, pasted);
      saveGoogleCalendar(userId, false);
      onChange({ kind: 'link', link: pasted });
      setText('');
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
  };

  const disconnect = () => {
    if (connection.kind === 'google') disconnectGoogleCalendar();
    forgetCalendarLink(userId);
    saveGoogleCalendar(userId, false);
    onChange({ kind: '' });
  };

  if (connection.kind) {
    return (
      <div className="calendar-connect">
        {needsTap && (
          <button type="button" className="step-btn secondary full-width" onClick={google}>
            <CalendarDays className="ico" aria-hidden="true" /> Check my Google Calendar
          </button>
        )}
        {error && <div className="calendar-error">{error}</div>}
        <span className="calendar-connected"><CalendarDays className="ico" aria-hidden="true" /> {connection.kind === 'google' ? 'Google Calendar' : 'Calendar'} connected</span>
        <button type="button" className="calendar-link-btn" onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="calendar-connect">
      {googleCalendarEnabled && (
        <button type="button" className="step-btn secondary full-width" onClick={google}>
          <CalendarDays className="ico" aria-hidden="true" /> Connect Google Calendar
        </button>
      )}
      {error && <div className="calendar-error">{error}</div>}
      {googleCalendarEnabled && !linkOpen && (
        <button type="button" className="calendar-link-btn" onClick={() => setLinkOpen(true)}>Apple or another calendar? Use a link</button>
      )}
      {linkOpen && (
        <>
          <input
            type="url"
            className="step-input"
            placeholder="Paste your calendar link"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <details className="calendar-help">
            <summary>Where do I find the link?</summary>
            <p><b>Apple Calendar</b>: Calendars → ⓘ next to your calendar → turn on Public Calendar → Share Link.</p>
            <p><b>Google Calendar</b> (on a computer): Settings → pick your calendar → "Secret address in iCal format".</p>
            <p>Treat the link like a password. It stays on this device, and we only read your busy times, never the event details.</p>
          </details>
          <button type="button" className="step-btn primary full-width" onClick={connectLink} disabled={busy || !text.trim()}>
            {busy ? <><span className="spinner" aria-hidden="true" />Checking…</> : 'Connect'}
          </button>
        </>
      )}
    </div>
  );
}
