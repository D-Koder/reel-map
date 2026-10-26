import React, { useEffect, useMemo, useState } from 'react';
import { PLAN_LENGTHS, pickerDays } from '../lib/freeSlot';

const dayName = (date) => date.toLocaleDateString(undefined, { weekday: 'short' });
const timeText = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const rangeText = (start, end) => `${timeText(start)} – ${timeText(end)}`;
const lengthText = (minutes) => (minutes === 60 ? '1 hour' : `${minutes} min`);
const longDay = (date) => `${dayName(date)} ${date.getDate()} ${date.toLocaleDateString(undefined, { month: 'short' })}`;

// Picks a day and a time inside the place's opening hours. With a calendar connected, times you're busy are
// hatched and still pickable (the warning says why); times the place would close before the plan ends are faded.
// `busy` is [{ start, end }] Dates; `connected` says whether it came from a calendar.
export default function TimePicker({ hours, busy, connected, minutes, onMinutes, onPick }) {
  const days = useMemo(() => pickerDays(hours, busy), [hours, busy, minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstFree = days.findIndex((day) => day.status === 'free');
  const [dayIndex, setDayIndex] = useState(Math.max(firstFree, 0));
  const [picked, setPicked] = useState(null);

  // A new plan length changes which times are free, so the pick starts over.
  useEffect(() => setPicked(null), [minutes, dayIndex]);

  const day = days[dayIndex];
  const clash = picked?.clash || [];
  const end = picked && new Date(picked.start.getTime() + minutes * 60000);

  return (
    <div className="time-picker">
      <div className="tp-length" role="group" aria-label="How long">
        <span>Plan for</span>
        {PLAN_LENGTHS.map((m) => (
          <button key={m} type="button" aria-pressed={m === minutes} onClick={() => onMinutes(m)}>{lengthText(m)}</button>
        ))}
      </div>

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

      {day.windows.length === 0 ? (
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
                  aria-pressed={picked?.start.getTime() === slot.start.getTime()}
                  disabled={slot.state === 'late'}
                  onClick={() => setPicked(slot)}
                >
                  {timeText(slot.start)}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {connected && day.windows.length > 0 && (
        <div className="tp-key"><span className="tp-slot free" /> Free <span className="tp-slot busy" /> You're busy <span className="tp-slot late" /> Closes too soon</div>
      )}

      {picked && (
        <>
          {clash.length > 0 && (
            <div className="tp-warn" role="alert">
              <b>You're busy then</b>
              {clash.map((item) => `${rangeText(item.start, item.end)}`).join(', ')} on your calendar. You can still pick this time.
            </div>
          )}
          <button type="button" className="step-btn primary full-width" onClick={() => onPick(picked.start)}>
            Pick {longDay(picked.start)} · {rangeText(picked.start, end)}{clash.length ? ' anyway' : ''}
          </button>
        </>
      )}
    </div>
  );
}
