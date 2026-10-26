import React, { useEffect, useMemo, useState } from 'react';
import { MIN_PLAN_MINUTES, PLAN_LENGTHS, pickerDays } from '../lib/freeSlot';

const dayName = (date) => date.toLocaleDateString(undefined, { weekday: 'short' });
const timeText = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const rangeText = (start, end) => `${timeText(start)} – ${timeText(end)}`;
const lengthText = (minutes) => (minutes === 60 ? '1 hour' : `${minutes} min`);
const longDay = (date) => `${dayName(date)} ${date.getDate()} ${date.toLocaleDateString(undefined, { month: 'short' })}`;

// Picks a day and a time inside the place's opening hours. With a calendar connected, times you're busy are
// hatched, and times the place would close before the plan ends are faded. Both can still be picked, with a
// warning that says why. Times show once a day is chosen. A plan is just a start time; once a time is picked,
// a length (`minutes`, null for none) can be added, which only changes what counts as busy or too late.
// `busy` is [{ start, end }] Dates; `connected` says whether it came from a calendar.
export default function TimePicker({ hours, busy, connected, minutes, onMinutes, onPick }) {
  const days = useMemo(() => pickerDays(hours, busy, new Date(), minutes || MIN_PLAN_MINUTES), [hours, busy, minutes]);
  const [dayIndex, setDayIndex] = useState(null);
  const [pickedAt, setPickedAt] = useState(null);

  // Another day starts the pick over.
  useEffect(() => setPickedAt(null), [dayIndex]);

  const day = dayIndex == null ? null : days[dayIndex];
  // The picked time as the current length sees it, so adding a length updates the warnings.
  const picked = pickedAt == null || !day ? null : day.windows.flatMap((window) => window.slots).find((slot) => slot.start.getTime() === pickedAt);
  const clash = picked?.clash || [];
  const end = picked && minutes ? new Date(picked.start.getTime() + minutes * 60000) : null;

  return (
    <div className="time-picker">
      <div className="tp-days" role="group" aria-label="Day">
        {days.map((item, i) => (
          <button
            key={item.date.getTime()}
            type="button"
            className={`tp-day ${item.status}`}
            aria-pressed={i === dayIndex}
            disabled={item.status === 'past'}
            onClick={() => setDayIndex(i)}
          >
            <small>{dayName(item.date)}</small>
            <b>{item.date.getDate()}</b>
            <i aria-hidden="true" />
            <span className="sr-only">{item.status === 'free' ? (connected ? 'You have a free time' : 'Open') : item.status === 'busy' ? 'Busy or closing soon' : 'Closed'}</span>
          </button>
        ))}
      </div>

      {!day ? (
        <div className="tp-empty">Pick a day to see times.</div>
      ) : day.windows.length === 0 ? (
        <div className="tp-empty">{day.status === 'past' ? 'No more times today.' : `Closed on ${day.date.toLocaleDateString(undefined, { weekday: 'long' })}s.`}</div>
      ) : (
        day.windows.map((window) => (
          <div key={window.start.getTime()} className="tp-window">
            <div className="tp-window-head">Open {rangeText(window.start, window.end)}</div>
            <div className="tp-slots">
              {window.slots.map((slot) => (
                <button
                  key={slot.start.getTime()}
                  type="button"
                  className={`tp-slot ${slot.state}`}
                  aria-pressed={pickedAt === slot.start.getTime()}
                  onClick={() => setPickedAt(slot.start.getTime())}
                >
                  {timeText(slot.start)}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {connected && day?.windows.length > 0 && (
        <div className="tp-key"><span className="tp-slot free" /> Free <span className="tp-slot busy" /> You're busy <span className="tp-slot late" /> Closes too soon</div>
      )}

      {picked && (
        <>
          <div className="tp-length" role="group" aria-label="How long (optional)">
            <span>How long? <small>Optional</small></span>
            {PLAN_LENGTHS.map((m) => (
              <button key={m} type="button" aria-pressed={m === minutes} onClick={() => onMinutes(m === minutes ? null : m)}>{lengthText(m)}</button>
            ))}
          </div>
          {picked.state === 'late' && (
            <div className="tp-warn" role="alert">
              <b>It closes too soon</b>
              Closes at {timeText(picked.closes)}{minutes ? ', before your plan ends' : ''}. You can still pick this time.
            </div>
          )}
          {clash.length > 0 && (
            <div className="tp-warn" role="alert">
              <b>You're busy then</b>
              {clash.map((item) => `${rangeText(item.start, item.end)}`).join(', ')} on your calendar. You can still pick this time.
            </div>
          )}
          <button type="button" className="step-btn primary full-width" onClick={() => onPick(picked.start)}>
            Pick {longDay(picked.start)} · {end ? rangeText(picked.start, end) : timeText(picked.start)}{clash.length || picked.state === 'late' ? ' anyway' : ''}
          </button>
        </>
      )}
    </div>
  );
}
