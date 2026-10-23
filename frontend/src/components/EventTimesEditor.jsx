import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { contactItems, contactLine, dayShort, dayString, datesText, timesText } from '../lib/eventRuns';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const monthOf = (day) => day.slice(0, 7);
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000) + 1;

// One run's calendar: tap the first day, then the last (the same day again for a one day event), like a
// flight search, then optional open and close times. Blank times mean all day.
function RunPanel({ run, today, disabled, onChange, onRemove, onDone }) {
  const [view, setView] = useState(monthOf(run.start || today));
  const [year, month] = view.split('-').map(Number);
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const total = new Date(year, month, 0).getDate();
  const picking = run.start && !run.end;

  const tap = (day) => {
    if (!run.start || run.end) onChange({ ...run, start: day, end: '' });
    else if (day < run.start) onChange({ ...run, start: day });
    else onChange({ ...run, end: day });
  };
  const shift = (n) => {
    const next = new Date(year, month - 1 + n, 1);
    setView(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  const overnight = run.open && run.close && run.close <= run.open;
  const hint = !run.start ? 'Tap the first day.'
    : picking ? 'Now tap the last day. Tap the same day again for a one day event.'
    : `${daysBetween(run.start, run.end)} ${daysBetween(run.start, run.end) === 1 ? 'day' : 'days'}. Tap a day to start over.`;

  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(<span key={`b${i}`} />);
  for (let d = 1; d <= total; d += 1) {
    const day = `${view}-${String(d).padStart(2, '0')}`;
    const ranged = run.start && run.end && run.end > run.start;
    const isEdge = day === run.start || day === run.end;
    const cls = ['evt-day',
      isEdge && 'is-edge',
      ranged && day > run.start && day < run.end && 'in-range',
      ranged && day === run.start && 'range-start',
      ranged && day === run.end && 'range-end',
      day === today && 'is-today'].filter(Boolean).join(' ');
    cells.push(
      <button key={day} type="button" className={cls} disabled={disabled || day < today} onClick={() => tap(day)}
        aria-label={dayShort(day)} aria-pressed={isEdge}>
        <span>{d}</span>
      </button>
    );
  }

  return (
    <div className="evt-panel">
      <div className="evt-pick">
        <div className={`evt-box${!run.start || run.end ? ' is-now' : ''}`}>
          <small>From</small>
          <b className={run.start ? '' : 'is-empty'}>{run.start ? dayShort(run.start) : 'Pick a day'}</b>
        </div>
        <span className="evt-arrow" aria-hidden="true">→</span>
        <div className={`evt-box${picking ? ' is-now' : ''}`}>
          <small>To</small>
          <b className={run.end ? '' : 'is-empty'}>{run.end ? dayShort(run.end) : picking ? 'Pick a day' : '—'}</b>
        </div>
      </div>

      <div className="evt-cal-head">
        <button type="button" className="evt-nav" onClick={() => shift(-1)} disabled={disabled || view <= monthOf(today)} aria-label="Previous month">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span>{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" className="evt-nav" onClick={() => shift(1)} disabled={disabled} aria-label="Next month">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="evt-grid">
        {WEEK.map((d, i) => <span key={i} className="evt-dow">{d}</span>)}
        {cells}
      </div>
      <p className="evt-hint" aria-live="polite">{hint}</p>

      <div className="evt-times">
        <label className="evt-time">
          <span>Opens</span>
          <input type="time" value={run.open} disabled={disabled} onChange={(e) => onChange({ ...run, open: e.target.value })} />
        </label>
        <label className="evt-time">
          <span>Closes</span>
          <input type="time" value={run.close} disabled={disabled} onChange={(e) => onChange({ ...run, close: e.target.value })} />
        </label>
      </div>
      <p className="evt-hint">Leave the times blank and it counts as all day.{overnight ? ' Closes after midnight, so it finishes the next morning.' : ''}</p>

      <div className="evt-actions">
        <button type="button" className="evt-link" onClick={onRemove} disabled={disabled}>Remove these dates</button>
        <button type="button" className="step-btn primary" onClick={onDone} disabled={disabled}>Done</button>
      </div>
    </div>
  );
}

// Who to ask about the event: one labelled box for each email and each phone number. The saved value is one
// line ("a@b.com / +61 3 9860 0500"). A box can sit empty or half typed, so the boxes are kept here and
// only reset when the line changes from outside (the AI reading a post).
function ContactFields({ contact, onContact, disabled }) {
  const [items, setItems] = useState(() => contactItems(contact));
  // The line this editor last gave its parent, so only a different line from outside resets the boxes.
  const sent = useRef(String(contact || ''));
  useEffect(() => {
    if (String(contact || '') !== sent.current) {
      sent.current = String(contact || '');
      setItems(contactItems(contact));
    }
  }, [contact]);
  const change = (next) => {
    setItems(next);
    sent.current = contactLine(next).slice(0, 120);
    onContact(sent.current);
  };
  const count = (kind, index) => items.slice(0, index + 1).filter((item) => item.kind === kind).length;
  const total = (kind) => items.filter((item) => item.kind === kind).length;
  const title = (item, index) => {
    const name = item.kind === 'email' ? 'Email' : 'Phone';
    return total(item.kind) > 1 ? `${name} ${count(item.kind, index)}` : name;
  };

  return (
    <div className="evt-contacts">
      <span className="evt-time-label">Enquiries (optional)</span>
      {items.map((item, i) => (
        <div className="evt-contact-row" key={i}>
          <label className="evt-time">
            <span>{title(item, i)}</span>
            <input
              type={item.kind === 'email' ? 'email' : 'tel'}
              inputMode={item.kind === 'email' ? 'email' : 'tel'}
              autoComplete="off"
              value={item.value}
              maxLength={80}
              placeholder={item.kind === 'email' ? 'name@example.com' : '+61 3 9000 0000'}
              disabled={disabled}
              onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
          </label>
          <button type="button" className="evt-x" onClick={() => change(items.filter((_, j) => j !== i))} disabled={disabled}
            aria-label={`Remove ${title(item, i).toLowerCase()}`}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="evt-add-row">
        <button type="button" className="evt-link" onClick={() => setItems([...items, { kind: 'email', value: '' }])} disabled={disabled}>+ Add email</button>
        <button type="button" className="evt-link" onClick={() => setItems([...items, { kind: 'phone', value: '' }])} disabled={disabled}>+ Add phone</button>
      </div>
    </div>
  );
}

// "When is it on?" for an event. runs: [{ start, end, open, close }]; onChange gets the new list.
// price / onPrice: an optional text box for what it costs, as written. contact / onContact: who to ask, an
// email, a phone number or both.
// Nothing is open until someone taps Add dates or a saved run. A run with no day picked is dropped on Done.
export default function EventTimesEditor({ runs, onChange, price = '', onPrice = null, contact = '', onContact = null, disabled = false, fromCaption = false }) {
  const [openIndex, setOpenIndex] = useState(-1);
  const today = dayString();
  const update = (index, run) => onChange(runs.map((r, i) => (i === index ? run : r)));
  const remove = (index) => { onChange(runs.filter((_, i) => i !== index)); setOpenIndex(-1); };
  const done = (index) => {
    const run = runs[index];
    if (!run?.start) remove(index);
    else { if (!run.end) update(index, { ...run, end: run.start }); setOpenIndex(-1); }
  };
  const add = () => {
    const last = runs[runs.length - 1];
    // The next run reuses the last one's times, since most events keep the same hours.
    onChange([...runs, { start: '', end: '', open: last?.open ?? '', close: last?.close ?? '' }]);
    setOpenIndex(runs.length);
  };

  return (
    <div className="field evt">
      <div className="evt-head">
        <span className="modal-label">When is it on?</span>
        {fromCaption && <span className="evt-tag">Read from the caption</span>}
      </div>
      {runs.map((run, i) => (i === openIndex ? (
        <RunPanel key={i} run={run} today={today} disabled={disabled}
          onChange={(next) => update(i, next)} onRemove={() => remove(i)} onDone={() => done(i)} />
      ) : (
        <div className="evt-sumrow" key={i}>
          <button type="button" className="evt-sum" onClick={() => setOpenIndex(i)} disabled={disabled}
            aria-label={`Edit ${datesText({ ...run, end: run.end || run.start })}`}>
            <span className="evt-sum-dates">{run.start ? datesText({ ...run, end: run.end || run.start }) : 'No dates yet'}</span>
            <span className="evt-sum-times">{timesText(run)}</span>
          </button>
          <button type="button" className="evt-x" onClick={() => remove(i)} disabled={disabled} aria-label="Remove these dates">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )))}
      {openIndex < 0 && (
        <button type="button" className="evt-link" onClick={add} disabled={disabled}>
          {runs.length ? '+ Add more dates' : '+ Add dates'}
        </button>
      )}
      {onPrice && (
        <label className="evt-time">
          <span>Price (optional)</span>
          <input type="text" value={price} maxLength={60} placeholder="e.g. Free, $25, $15–$40" disabled={disabled}
            onChange={(e) => onPrice(e.target.value)} />
        </label>
      )}
      {onContact && <ContactFields contact={contact} onContact={onContact} disabled={disabled} />}
    </div>
  );
}
