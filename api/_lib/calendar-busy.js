const ICAL = require('ical.js');

// Reads a person's calendar link (the "secret address in iCal format" from Google Calendar, or an iCloud
// public calendar link) and answers with the times they're busy. The link is a secret: it's only used for
// this one request, never saved or logged.

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_OCCURRENCES = 20000;
const MAX_BUSY = 1000;

// Only these calendar hosts are fetched, so this can't be pointed at anything else.
const HOSTS = [/^calendar\.google\.com$/, /(^|\.)icloud\.com$/, /^outlook\.(office365|live)\.com$/];

// The link as a URL when it's https (webcal:// is https underneath) on one of the calendar hosts above, else null.
function calendarUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim().replace(/^webcal:/i, 'https:'));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  return HOSTS.some((host) => host.test(url.hostname.toLowerCase())) ? url : null;
}

// The calendar's text. A redirect is followed only to another allowed calendar host.
async function fetchCalendar(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (response.status >= 300 && response.status < 400) {
      const next = calendarUrl(new URL(response.headers.get('location') || '', current).href);
      if (!next) throw new Error('Calendar link redirected somewhere else');
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`Calendar answered ${response.status}`);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Calendar is too big');
      }
      chunks.push(part.value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link is not a calendar');
    return text;
  }
  throw new Error('Calendar link redirected too many times');
}

// [{ start, end }] (Dates) of the busy times that touch from–to. All-day events (birthdays, holidays),
// "free" events and cancelled ones don't count as busy.
function busyTimes(text, from, to) {
  ICAL.TimezoneService.reset();
  const root = new ICAL.Component(ICAL.parse(text));
  root.getAllSubcomponents('vtimezone').forEach((zone) => {
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // A zone that can't be read: its events fall back to the calendar's own times.
    }
  });
  const events = root.getAllSubcomponents('vevent').map((part) => new ICAL.Event(part));
  const masters = events.filter((event) => !event.isRecurrenceException());
  events.filter((event) => event.isRecurrenceException()).forEach((exception) => {
    masters.find((master) => master.uid === exception.uid)?.relateException(exception);
  });

  const busy = [];
  const add = (start, end) => {
    if (end > from && start < to && busy.length < MAX_BUSY) busy.push({ start, end });
  };
  const counts = (event) => event.component.getFirstPropertyValue('transp') !== 'TRANSPARENT'
    && event.component.getFirstPropertyValue('status') !== 'CANCELLED';

  masters.forEach((event) => {
    if (!event.startDate || event.startDate.isDate || !counts(event)) return;
    if (!event.isRecurring()) {
      add(event.startDate.toJSDate(), event.endDate.toJSDate());
      return;
    }
    const iterator = event.iterator();
    let next = iterator.next();
    for (let count = 0; next && count < MAX_OCCURRENCES; count += 1, next = iterator.next()) {
      if (next.toJSDate() > to) break;
      const details = event.getOccurrenceDetails(next);
      if (counts(details.item)) add(details.startDate.toJSDate(), details.endDate.toJSDate());
    }
  });
  return busy.sort((a, b) => a.start - b.start);
}

module.exports = { calendarUrl, fetchCalendar, busyTimes };
