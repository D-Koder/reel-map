import { openWindows } from './hours';

const STEP_MINUTES = 30;
// A calendar event made from a booking lasts 2 hours (lib/calendar.js), so a free slot is that long.
export const SLOT_MINUTES = 120;
const DAYS_AHEAD = 14;
// Visits are suggested between 5 and 8 PM on weekdays and 10 AM and 8 PM at weekends, when the place is open then.
const SOCIAL_TO = 20 * 60;
const socialFrom = (day) => (day === 0 || day === 6 ? 10 * 60 : 17 * 60);

// Up to `count` times in the next 2 weeks when the place is open for 2 hours and none of `busy`
// ([{ start, end }] Dates) overlaps: [{ start, end }] Dates, one per day, earliest first. Usual visiting times
// are used when there are any, so a place that is open all day isn't suggested at midnight or during a work
// day; otherwise any time it's open. Hours that can't be read give [] (nothing to compare the calendar against).
export function suggestSlots(hours, busy, now = new Date(), count = 4) {
  const length = SLOT_MINUTES * 60000;
  const step = STEP_MINUTES * 60000;
  const earliest = Math.ceil((now.getTime() + 60 * 60000) / step) * step;
  const isFree = (start) => !busy.some((item) => start < item.end.getTime() && start + length > item.start.getTime());

  const find = (accept) => {
    const found = [];
    for (let day = 0; day < DAYS_AHEAD && found.length < count; day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
      const first = (openWindows(hours, date) || []).reduce((hit, window) => {
        if (hit) return hit;
        let start = Math.ceil(Math.max(window.start.getTime(), earliest) / step) * step;
        for (; start + length <= window.end.getTime(); start += step) {
          const at = new Date(start);
          if (accept(at.getHours() * 60 + at.getMinutes(), at.getDay()) && isFree(start)) return { start: at, end: new Date(start + length) };
        }
        return null;
      }, null);
      if (first) found.push(first);
    }
    return found;
  };

  const usual = find((minute, day) => minute >= socialFrom(day) && minute <= SOCIAL_TO);
  return usual.length ? usual : find(() => true);
}

// The first of those times, or null.
export const suggestSlot = (hours, busy, now = new Date()) => suggestSlots(hours, busy, now, 1)[0] || null;

// "Sat 31 Oct", the same order in every language.
const dayText = (date) => `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()} ${date.toLocaleDateString(undefined, { month: 'short' })}`;
const timeText = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// "Sat 31 Oct, 6:00 PM – 8:00 PM"
export const formatSlot = ({ start, end }) => `${dayText(start)}, ${timeText(start)} – ${timeText(end)}`;

// "Sat 31 Oct · 6 PM" for a button, and "Sat 31 · 6 PM" for a chip.
const hourText = (date) => timeText(date).replace(':00', '');
export const slotLabel = (date) => `${dayText(date)} · ${hourText(date)}`;
export const slotChip = (date) => `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()} · ${hourText(date)}`;
