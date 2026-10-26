import { openWindows } from './hours';

const STEP_MINUTES = 30;
// A calendar event made from a booking lasts 2 hours (lib/calendar.js), so a free slot is that long.
export const SLOT_MINUTES = 120;
const DAYS_AHEAD = 14;
// Visits are suggested between 5 and 8 PM on weekdays and 10 AM and 8 PM at weekends, when the place is open then.
const SOCIAL_TO = 20 * 60;
const socialFrom = (day) => (day === 0 || day === 6 ? 10 * 60 : 17 * 60);

// The first time in the next 2 weeks that the place is open for 2 hours and none of `busy`
// ([{ start, end }] Dates) overlaps it: { start, end } Dates, or null. Usual visiting times come first,
// so a place that is open all day isn't suggested at midnight or during a work day. Hours that can't be read give null:
// there's nothing to compare the calendar against.
export function suggestSlot(hours, busy, now = new Date()) {
  const length = SLOT_MINUTES * 60000;
  const step = STEP_MINUTES * 60000;
  const earliest = Math.ceil((now.getTime() + 60 * 60000) / step) * step;
  const isFree = (start) => !busy.some((item) => start < item.end.getTime() && start + length > item.start.getTime());

  const find = (accept) => {
    for (let day = 0; day < DAYS_AHEAD; day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
      for (const window of openWindows(hours, date) || []) {
        let start = Math.max(window.start.getTime(), earliest);
        start = Math.ceil(start / step) * step;
        for (; start + length <= window.end.getTime(); start += step) {
          const at = new Date(start);
          const minute = at.getHours() * 60 + at.getMinutes();
          if (accept(minute, at.getDay()) && isFree(start)) return { start: new Date(start), end: new Date(start + length) };
        }
      }
    }
    return null;
  };

  return find((minute, day) => minute >= socialFrom(day) && minute <= SOCIAL_TO) || find(() => true);
}

// "Sat 31 Oct, 6:00 – 8:00 PM"
export function formatSlot({ start, end }) {
  const day = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time(start)} – ${time(end)}`;
}
