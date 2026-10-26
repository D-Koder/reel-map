// Open-now status and suburb, from what a place already saves.
// Hours look like [{ days: 'Monday', time: '11 AM–10:30 PM' }], as read from Google Maps:
// a time can be "Closed", "Open 24 hours", or several ranges ("11:30 AM–3 PM, 5–10 PM").

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "10:30 PM" → minutes after midnight. A time without AM/PM takes `meridiem`.
function toMinutes(text, meridiem) {
  const match = String(text).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  const half = (match[3] || meridiem || '').toUpperCase();
  if (!half) return null;
  if (half === 'PM') hour += 12;
  return hour * 60 + Number(match[2] || 0);
}

// One day's ranges as [{ start, end, endText }] in minutes; an end past midnight is over 1440.
// [] means closed that day; null means the text couldn't be read.
function dayRanges(time) {
  const clean = String(time || '').replace(/[  ]/g, ' ');
  if (/24 hours/i.test(clean)) return [{ start: 0, end: 1440, endText: null }];
  if (/closed/i.test(clean)) return [];
  const ranges = clean.split(',').flatMap((part) => {
    const [startText, endText] = part.split(/\s*[–—-]\s*/);
    if (!startText || !endText) return [];
    const endMeridiem = endText.match(/(AM|PM)\s*$/i)?.[1];
    const end = toMinutes(endText, endMeridiem);
    let start = toMinutes(startText, endMeridiem);
    if (start == null || end == null) return [];
    // "11–3 PM" means 11 AM: a start that borrowed PM and lands after the end was really AM.
    if (!/(AM|PM)/i.test(startText) && start > end && endMeridiem?.toUpperCase() === 'PM') start -= 720;
    return [{ start, end: end <= start ? end + 1440 : end, endText: endText.trim() }];
  });
  return ranges.length ? ranges : null;
}

function hoursFor(hours, dayIndex) {
  const name = DAY_NAMES[dayIndex];
  const entry = hours.find((h) => {
    const days = String(h.days || '').toLowerCase();
    return days === name || days.startsWith(name.slice(0, 3));
  });
  return entry ? dayRanges(entry.time) : null;
}

// { open, text } for right now, e.g. { open: true, text: 'Open · closes 10:30 PM' }.
// Null when the hours are missing or can't be read, so nothing is shown rather than a wrong guess.
export function openStatus(hours, now = new Date()) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const today = hoursFor(hours, now.getDay());
  if (today === null) return null;
  const minute = now.getHours() * 60 + now.getMinutes();
  // Last night's hours can run past midnight into today (e.g. 5 PM–1 AM).
  const yesterday = hoursFor(hours, (now.getDay() + 6) % 7) ?? [];
  const lateNight = yesterday.find((r) => r.end > 1440 && minute < r.end - 1440);
  if (lateNight) return { open: true, text: `Open · closes ${lateNight.endText}` };

  const current = today.find((r) => minute >= r.start && minute < r.end);
  if (current) {
    if (current.end >= 1440 && current.start === 0) return { open: true, text: 'Open 24 hours' };
    return { open: true, text: `Open · closes ${current.endText}` };
  }
  const next = today.filter((r) => r.start > minute).sort((a, b) => a.start - b.start)[0];
  if (next) {
    const hour = Math.floor(next.start / 60) % 24;
    const mins = next.start % 60;
    const label = `${hour % 12 || 12}${mins ? `:${String(mins).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
    return { open: false, text: `Closed · opens ${label}` };
  }
  return { open: false, text: today.length ? 'Closed for today' : 'Closed today' };
}

// The suburb from an address: "46 Little La Trobe St, Melbourne VIC 3004, Australia" → "Melbourne".
// Null when the address has no clear suburb part.
export function suburbOf(address) {
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Drop a trailing country (a last part with no digits, after a part with a postcode).
  if (parts.length > 2 && !/\d/.test(parts[parts.length - 1])) parts.pop();
  const suburb = parts[parts.length - 1]
    .replace(/\s+[A-Z]{2,3}\s+\d{3,5}$/, '')
    .replace(/\s+\d{3,5}$/, '')
    .trim();
  // A part that starts with a number is a street, not a suburb.
  return suburb && !/^\d/.test(suburb) ? suburb : null;
}

// The open times on one calendar day as [{ start, end }] Dates, or null when the hours can't be read for that day.
// A closing time after midnight ends on the next day. "Closed" gives [].
export function openWindows(hours, date) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const ranges = hoursFor(hours, date.getDay());
  if (ranges === null) return null;
  const at = (minutes) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes);
  return ranges.map((range) => ({ start: at(range.start), end: at(range.end) }));
}
