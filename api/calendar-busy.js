const { requireUser } = require('./_lib/auth');
const { calendarUrl, fetchCalendar, busyTimes } = require('./_lib/calendar-busy');

const MAX_SPAN_MS = 31 * 24 * 60 * 60 * 1000;

// When someone is busy. Body: { calendarUrl, from, to } (ISO times, at most 31 days apart) → { busy: [{ start, end }] }.
// The calendar link is a secret, so it is used for this request only: not saved, not logged, not in any error.
module.exports = requireUser(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const url = calendarUrl(req.body?.calendarUrl);
  if (!url) return res.status(400).json({ error: 'That is not a Google, Apple or Outlook calendar link' });
  const from = new Date(req.body?.from);
  const to = new Date(req.body?.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > MAX_SPAN_MS) {
    return res.status(400).json({ error: 'Pick up to 31 days' });
  }
  let text;
  try {
    text = await fetchCalendar(url);
  } catch (error) {
    console.warn('Calendar fetch failed:', error.name, error.message);
    return res.status(502).json({ error: 'Could not read that calendar. Check the link and try again.' });
  }
  try {
    const busy = busyTimes(text, from, to).map(({ start, end }) => ({ start: start.toISOString(), end: end.toISOString() }));
    return res.status(200).json({ busy });
  } catch (error) {
    console.warn('Calendar parse failed:', error.message);
    return res.status(502).json({ error: 'Could not read that calendar. Check the link and try again.' });
  }
}, { endpoint: 'calendar-busy', perHour: 60 });
