import { openWindows } from './hours';

const STEP_MINUTES = 30;
// A plan is a start time. A length of 30 minutes to an hour can be added; without one a time only has to be free
// and open for the shortest, and a calendar event lasts the longest.
export const PLAN_LENGTHS = [30, 45, 60];
export const MIN_PLAN_MINUTES = 30;
export const DEFAULT_PLAN_MINUTES = 60;
const DAYS_AHEAD = 14;
// Visits are suggested between 5 and 8 PM on weekdays and 10 AM and 8 PM at weekends, when the place is open then.
const SOCIAL_TO = 20 * 60;
const socialFrom = (day) => (day === 0 || day === 6 ? 10 * 60 : 17 * 60);

// The parts of `busy` that overlap a plan starting at `start` (ms) for `minutes`.
export const clashes = (busy, start, minutes) => busy.filter((item) => start < item.end.getTime() && start + minutes * 60000 > item.start.getTime());

// Up to `count` times in the next 2 weeks when the place is open for `minutes` and none of `busy`
// ([{ start, end }] Dates) overlaps: [{ start, end }] Dates, one per day, earliest first. Usual visiting times
// are used when there are any, so a place that is open all day isn't suggested at midnight or during a work
// day; otherwise any time it's open. Hours that can't be read give [] (nothing to compare the calendar against).
export function suggestSlots(hours, busy, now = new Date(), count = 4, minutes = DEFAULT_PLAN_MINUTES) {
  const length = minutes * 60000;
  const step = STEP_MINUTES * 60000;
  const earliest = Math.ceil((now.getTime() + 60 * 60000) / step) * step;
  const isFree = (start) => !clashes(busy, start, minutes).length;

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


// The next `count` days for the time picker: [{ date, status, windows: [{ start, end, slots: [{ start, state, clash, closes }] }] }].
// A slot's state is 'free', 'busy' (overlaps `busy`: still pickable, with a warning), or 'late' (the place closes
// before the plan would end; `closes` is when). Both can still be picked, with a warning. `status` is 'free' (a free time exists), 'busy' (open, but every time clashes or is
// too late), 'closed', or 'past'. Times before the earliest start are left out. Hours that can't be read for a day
// give no windows and 'closed'.
export function pickerDays(hours, busy, now = new Date(), minutes = DEFAULT_PLAN_MINUTES, count = DAYS_AHEAD) {
  const length = minutes * 60000;
  const step = STEP_MINUTES * 60000;
  const earliest = Math.ceil((now.getTime() + 60 * 60000) / step) * step;
  const days = [];
  for (let day = 0; day < count; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    const sixAm = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 6).getTime();
    const open = openWindows(hours, date) || [];
    const windows = open.map((window) => {
      const slots = [];
      let start = Math.ceil(Math.max(window.start.getTime(), earliest, sixAm) / step) * step;
      for (; start < window.end.getTime(); start += step) {
        const at = new Date(start);
        const late = start + length > window.end.getTime();
        const clash = late ? [] : clashes(busy, start, minutes);
        slots.push({ start: at, state: late ? 'late' : clash.length ? 'busy' : 'free', clash, closes: late ? window.end : null });
      }
      return { start: window.start, end: window.end, slots };
    }).filter((window) => window.slots.length);
    const all = windows.flatMap((window) => window.slots);
    const status = !all.length
      ? (open.length ? 'past' : 'closed')
      : all.some((slot) => slot.state === 'free') ? 'free' : 'busy';
    days.push({ date, status, windows });
  }
  return days;
}
