// Builds a 2-hour calendar event (.ics) for a booked place and opens it.
// Works with Apple Calendar, Google Calendar and most other calendar apps.
export function addToCalendar({ title, location, description, start }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

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

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reel-map-event.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
