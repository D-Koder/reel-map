// When an event is on: a list of runs, each a first and last day ("2026-11-13") and optional open and close
// times ("11:00", 24 hour). A run with no times is on all day. An event can have several runs, e.g. two
// weekends. Saved on collection_places.event_runs (see 20261023090000_event_runs.sql), with event_date and
// event_end_date kept as the first and last day overall, so anything that only knows those still works.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
const noon = (day) => new Date(`${day}T12:00:00`);

// Today's day in this device's time zone, as "2026-10-23".
export const dayString = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const addDays = (day, n) => { const d = noon(day); d.setDate(d.getDate() + n); return dayString(d); };

const minutes = (time) => (TIME.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null);

// Runs as saved, kept only when they make sense, in date order. A close time with no open time is dropped.
export function cleanRuns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((run) => run && DAY.test(String(run.start || '')))
    .map((run) => {
      const start = run.start;
      const end = DAY.test(String(run.end || '')) && run.end >= start ? run.end : start;
      const open = TIME.test(run.open || '') ? run.open : '';
      const close = open && TIME.test(run.close || '') ? run.close : '';
      return { start, end, open, close };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

// The runs for a place: the saved ones, else one all-day run from its event days, else none.
export function runsOf(place) {
  const saved = cleanRuns(place?.event_runs);
  if (saved.length) return saved;
  return DAY.test(String(place?.event_date || ''))
    ? cleanRuns([{ start: place.event_date, end: place.event_end_date }])
    : [];
}

// The two columns kept for runs: the first day, and the last when it runs past the first.
export function runDays(runs) {
  const list = cleanRuns(runs);
  if (!list.length) return { eventDate: null, eventEndDate: null };
  const last = list.reduce((max, run) => (run.end > max ? run.end : max), list[0].end);
  return { eventDate: list[0].start, eventEndDate: last > list[0].start ? last : null };
}

// "11am", "6:30pm".
export function clock(time) {
  const m = minutes(time);
  if (m === null) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${pad(mm)}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

export const dayMonth = (day) => `${noon(day).getDate()} ${MONTHS[noon(day).getMonth()]}`;
export const dayShort = (day) => `${WEEKDAYS[noon(day).getDay()]} ${dayMonth(day)}`;

// "Fri 13 Nov", "13–15 Nov", "30 Nov – 2 Dec".
export function datesText(run) {
  if (!run.end || run.end === run.start) return dayShort(run.start);
  const a = noon(run.start);
  const b = noon(run.end);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${dayMonth(run.end)}` : `${dayMonth(run.start)} – ${dayMonth(run.end)}`;
}

// "11am–10pm", "From 6pm", or "All day" when it has no times. Past midnight adds "+1".
export function timesText(run) {
  const open = minutes(run.open);
  if (open === null) return 'All day';
  const close = minutes(run.close);
  if (close === null) return `From ${clock(run.open)}`;
  return `${clock(run.open)}–${clock(run.close)}${close <= open ? ' +1' : ''}`;
}

export const runOn = (runs, day) => runs.find((run) => run.start <= day && day <= run.end) ?? null;

// The first day on or after `day` that the event is on, or '' when every run is over.
export function nextDay(runs, day) {
  let best = '';
  for (const run of runs) {
    if (run.end < day) continue;
    const found = run.start > day ? run.start : day;
    if (!best || found < best) best = found;
  }
  return best;
}

// Where an event stands at `now`: { kind: 'open' | 'soon' | 'later' | 'over', text }.
// open: on right now. soon: on today but not started. later: on another day. over: all runs finished.
export function eventStatus(runsIn, now = new Date()) {
  const runs = cleanRuns(runsIn);
  if (!runs.length) return null;
  const today = dayString(now);
  const minute = now.getHours() * 60 + now.getMinutes();

  // An overnight run that started yesterday may still be going.
  const lastNight = runOn(runs, addDays(today, -1));
  if (lastNight && minutes(lastNight.open) !== null && minutes(lastNight.close) !== null &&
      minutes(lastNight.close) <= minutes(lastNight.open) && minute < minutes(lastNight.close)) {
    return { kind: 'open', text: `Open now · closes ${clock(lastNight.close)}` };
  }
  const now_ = runOn(runs, today);
  if (now_) {
    const open = minutes(now_.open);
    const close = minutes(now_.close);
    if (open === null) return { kind: 'open', text: 'On today · all day' };
    if (minute < open) return { kind: 'soon', text: `Opens at ${clock(now_.open)} today` };
    if (close === null) return { kind: 'open', text: `On now · from ${clock(now_.open)}` };
    if (close <= open) return { kind: 'open', text: `Open now · closes ${clock(now_.close)} tomorrow` };
    if (minute < close) return { kind: 'open', text: `Open now · closes ${clock(now_.close)}` };
  }
  const next = nextDay(runs, addDays(today, now_ ? 1 : 0));
  if (next) return { kind: 'later', text: `${now_ ? 'Closed for today. ' : ''}Next: ${dayShort(next)}, ${timesText(runOn(runs, next))}` };
  return { kind: 'over', text: 'This event has finished' };
}

// One sentence for the place page's check step, with the price when there is one.
export function eventSummary(name, runsIn, price = '', now = new Date()) {
  const runs = cleanRuns(runsIn);
  const today = dayString(now);
  const cost = price ? ` ${/^free\b/i.test(price) ? 'Free entry.' : `Price: ${price}.`}` : '';
  const on = runOn(runs, today);
  if (on) return `${name} is on today, ${timesText(on) === 'All day' ? 'all day' : timesText(on)}.${cost} Does that work for you?`;
  const next = nextDay(runs, today);
  return next
    ? `${name} is next on ${dayShort(next)}, ${timesText(runOn(runs, next)).replace(/^All day$/, 'all day')}.${cost} Does that work for you?`
    : `${name} has finished. Check before you go.`;
}

// Tap-to-email and tap-to-call links from an enquiries line ("a@b.com / +61 3 9860 0500"): [{ label, href }].
export function contactLinks(text) {
  const line = String(text || '');
  const emails = line.match(/[^\s,;/()<>]+@[^\s,;/()<>]+\.[^\s,;/()<>]*[A-Za-z]/g) || [];
  const phones = line.replace(/[^\s,;/()<>]+@[^\s,;/()<>]+/g, ' ').match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  return [
    ...emails.map((email) => ({ label: email, href: `mailto:${email}`, kind: 'email' })),
    ...phones.map((phone) => ({ label: phone.trim(), href: `tel:${phone.trim().replace(/[^\d+]/g, '')}`, kind: 'phone' })),
  ];
}
