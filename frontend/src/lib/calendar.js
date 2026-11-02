// Builds a calendar event (.ics) of `minutes` (2 hours when not given) for a planned place and opens it.
// Works with Apple Calendar, Google Calendar and most other calendar apps.
export function addToCalendar({ title, location, description, start, minutes = 120 }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + minutes * 60 * 1000);

  const formatUtc = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escape = (text) => String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reel Map//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@reel-map`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(startDate)}`,
    `DTEND:${formatUtc(endDate)}`,
    `SUMMARY:${escape(title)}`,
    location ? `LOCATION:${escape(location)}` : null,
    description ? `DESCRIPTION:${escape(description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const ics = lines.join('\r\n');
  const sharedFile = typeof File === 'function' ? new File([ics], 'reel-map-event.ics', { type: 'text/calendar' }) : null;
  // iPhone and iPad: opening the event as a data link shows "Add to Calendar". A download there
  // only saves the file to Files, so the event never reaches the calendar.
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos) {
    const openAsLink = () => { window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`; };
    // The share sheet lists Calendar for an .ics file and works where opening a data link does nothing.
    if (sharedFile && navigator.canShare?.({ files: [sharedFile] })) {
      navigator.share({ files: [sharedFile], title }).catch((error) => { if (error?.name !== 'AbortError') openAsLink(); });
    } else {
      openAsLink();
    }
    return;
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reel-map-event.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download before the browser reads the file.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// A link that opens Google Calendar with the event filled in (its app on a phone, the site elsewhere).
export function googleCalendarUrl({ title, location, description, start, minutes = 120 }) {
  const startDate = new Date(start);
  const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(startDate)}/${stamp(new Date(startDate.getTime() + minutes * 60 * 1000))}`,
  });
  if (location) params.set('location', location);
  if (description) params.set('details', description);
  return `https://calendar.google.com/calendar/render?${params}`;
}
