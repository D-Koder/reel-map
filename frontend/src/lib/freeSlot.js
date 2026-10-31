import { openWindows } from './hours';

const STEP_MINUTES = 30;
// A plan is a start time. A length of 30 minutes to an hour can be added; without one a time only has to be free
// and open for the shortest, and a calendar event lasts the longest.
export const PLAN_LENGTHS = [30, 45, 60];
export const MIN_PLAN_MINUTES = 30;
export const DEFAULT_PLAN_MINUTES = 60;
const DAYS_AHEAD = 14;

// The parts of `busy` that overlap a plan starting at `start` (ms) for `minutes`.
export const clashes = (busy, start, minutes) => busy.filter((item) => start < item.end.getTime() && start + minutes * 60000 > item.start.getTime());

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
