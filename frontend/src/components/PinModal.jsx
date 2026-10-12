import React, { useEffect, useState } from 'react';
import { ArrowUpRight, BellRing, CalendarCheck, CalendarDays, CalendarPlus, CircleCheck, Clock, Globe, Hourglass, Link, PartyPopper, Pencil, Phone, Trash2, UtensilsCrossed, X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { feelings, formatDate, formatDateTime, toLocalInputValue } from '../lib/constants';
import { addToCalendar } from '../lib/calendar';
import ConfirmDialog from './ConfirmDialog';
import PlaceThumb from './PlaceThumb';
import Avatar from './Avatar';
import { checkedGoogleMapsLink, googleMapsLink } from '../lib/places';

function formatWait(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function bookingLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.startsWith('opentable')) return 'OpenTable';
    if (host.startsWith('ticketmaster')) return 'Ticketmaster';
  } catch {
    // fall through
  }
  return 'Book online';
}

// Next Saturday, 7pm local time.
function defaultReservation() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(19, 0, 0, 0);
  return toLocalInputValue(d);
}

// Your vote sits on top. Below it, everyone grouped by their vote (you first in yours),
// and the people who haven't voted yet with a Nudge that shares a message to the group chat.
function VoteBoard({ members, reactions, userId, sharedBy, placeName, onSetVibe, showToast }) {
  const myVote = reactions[userId];
  const others = members.filter((m) => m.id !== userId);
  const waiting = others.filter((m) => !reactions[m.id]);
  const everyoneElseIn = others.length > 0 && waiting.length === 0;
  const nameOf = (person) => (person.id === userId ? 'You' : person.display_name);

  const nudge = async () => {
    const text = `Are you keen on ${placeName}? Vote in Reel Map`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Reel Map', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}: ${url}`);
      showToast('Nudge copied. Paste it in your group chat.');
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error?.name !== 'AbortError') showToast("Couldn't share the nudge. Try again.");
    }
  };

  const chip = (person) => (
    <span key={person.id} className={`vote-person ${person.id === userId ? 'me' : ''}`}>
      <Avatar person={person} className="vote-person-avatar" />
      {nameOf(person)}
      {person.id === sharedBy && <span className="person-tag">shared reel</span>}
    </span>
  );

  return (
    <div className="modal-section vote-board">
      <div className={`my-vote ${myVote ? 'voted' : ''}`}>
        <div className="my-vote-label">
          {myVote ? 'Your vote' : everyoneElseIn ? 'Your vote? Everyone else is in.' : 'Your vote?'}
        </div>
        <div className="vote-buttons" role="radiogroup" aria-label="Your vote">
          {feelings.map((f) => (
            <button
              type="button"
              key={f.id}
              role="radio"
              aria-checked={myVote === f.id}
              className={`vote-button ${myVote === f.id ? 'selected' : ''}`}
              onClick={() => onSetVibe(f.id)}
            >
              <span aria-hidden="true">{f.emoji}</span> {f.label}
            </button>
          ))}
        </div>
      </div>

      {members.length > 1 && (
        <>
          {feelings.map((f) => {
            const group = members
              .filter((m) => reactions[m.id] === f.id)
              .sort((a, b) => (b.id === userId) - (a.id === userId));
            if (!group.length) return null;
            return (
              <div className="vote-group" key={f.id}>
                <div className="vote-group-head"><span><span aria-hidden="true">{f.emoji}</span> {f.label} · {group.length}</span></div>
                <div className="vote-people">{group.map(chip)}</div>
              </div>
            );
          })}
          {waiting.length > 0 && (
            <div className="vote-group">
              <div className="vote-group-head">
                <span><Hourglass className="ico" aria-hidden="true" /> Not voted · {waiting.length}</span>
                <button type="button" className="nudge-button" onClick={nudge}>
                  <BellRing className="ico" aria-hidden="true" /> {waiting.length > 1 ? 'Nudge all' : 'Nudge'}
                </button>
              </div>
              <div className="vote-people">{waiting.map(chip)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PinModal({
  place,
  userId,
  members,
  onSetVibe,
  onBook,
  onMarkDone,
  onEdit,
  onDelete,
  onClose,
  showToast,
}) {
  const booking = place.booking;
  const nameOf = (id) => (id === userId ? 'you' : members.find((m) => m.id === id)?.display_name ?? 'someone else');
  const adderName = place.added_by === userId ? 'you' : members.find((m) => m.id === place.added_by)?.display_name ?? 'someone';

  // Every member can open the place sheet to copy it. Only whoever added it can change it (the sheet enforces that).
  // Delete: the booker if booked, otherwise whoever added it.
  const canDelete = booking ? booking.booked_by === userId : place.added_by === userId;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Decided once, when the sheet opens: an already-booked place skips the checklist entirely,
  // while one booked mid-flow keeps going to the calendar step.
  const [wasBooked] = useState(Boolean(booking));
  const steps = [1, 2, 3];
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [reservationDate, setReservationDate] = useState(defaultReservation);
  // Worked out when the sheet opens, so tapping the address opens it straight away.
  const [mapsLink, setMapsLink] = useState(() => googleMapsLink(place));
  useEffect(() => {
    const controller = new AbortController();
    checkedGoogleMapsLink(place, controller.signal).then((link) => {
      if (!controller.signal.aborted) setMapsLink(link);
    });
    return () => controller.abort();
  }, [place.id, place.address, place.lat, place.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const [calendarTitle, setCalendarTitle] = useState(`${place.name}`);
  const [now, setNow] = useState(() => Date.now());
  const sheetRef = React.useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmingDelete) setConfirmingDelete(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmingDelete]);


  const completeStep = async (stepNum) => {
    if (stepNum === 2) {
      setSaving(true);
      const ok = await onBook(reservationDate);
      setSaving(false);
      if (!ok) return;
    }
    showToast(`Step ${steps.indexOf(stepNum) + 1} complete`);
    const next = steps[steps.indexOf(stepNum) + 1];
    setStep(next ?? 'final');
  };

  const openReel = () => {
    if (!place.reel_url) return;
    window.open(place.reel_url, '_blank', 'noopener');
  };

  const openBooking = () => {
    showToast(`Opening ${bookingLabel(place.booking_url)}...`);
    window.open(place.booking_url, '_blank', 'noopener');
  };

  const callVenue = () => {
    if (place?.phone) window.location.href = `tel:${place.phone.replace(/[^\d+]/g, '')}`;
    else showToast('No phone number listed');
  };

  const addToCalendar = () => {
    showToast(`Added "${calendarTitle}" to calendar`);
    completeStep(3);
  };

  const hours = Array.isArray(place?.hours) ? place.hours : [];
  const satHours = hours.find((h) => /sat/i.test(h.days));
  const hoursSummary = hours.length
    ? `${place.name} is open ${satHours ? `Saturday ${satHours.time}` : `${hours[0].days} ${hours[0].time}`}. Does that work for you?`
    : "We don't have opening hours for this place yet — check before you go.";

  const unlockAt = booking ? new Date(booking.planned_at).getTime() + 60 * 60 * 1000 : null;
  const doneLocked = unlockAt !== null && now < unlockAt;
  const stepLabel = (n) => `Step ${steps.indexOf(n) + 1} of ${steps.length}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={place.name}
        ref={sheetRef}
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetDrag} />
        <div className="modal-header">
          <div className="modal-title">{place.emoji && <span aria-hidden="true">{place.emoji} </span>}{place.name}</div>
          <div className="modal-header-actions">
            <button className="modal-close" onClick={onEdit} aria-label="Edit place" title="Edit or copy">
              <Pencil aria-hidden="true" />
            </button>
            {canDelete && (
              <button
                className="modal-close"
                // A booked place asks first, to warn about the booking. Otherwise delete straight away: the toast has Undo.
                onClick={() => (booking ? setConfirmingDelete(true) : onDelete())}
                aria-label="Delete place"
                title="Delete"
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
          </div>
        </div>

        {place?.subtitle && <div className="venue-subtitle">{place.subtitle}</div>}
        {place?.custom_info && <div className="venue-subtitle">{place.custom_info}</div>}

        <div className="reel-context">
          <button className="reel-thumb-btn" onClick={openReel} aria-label="View reel" disabled={!place.reel_url}>
            <PlaceThumb place={place} className="reel-thumbnail-small" />
          </button>
          <div className="reel-info-small">
            <div className="reel-sender">Added by {adderName}</div>
            <div className="reel-date">{formatDate(place.created_at)}</div>
            {booking && <div className="reel-booked"><CalendarCheck className="ico" aria-hidden="true" /> Booked by {nameOf(booking.booked_by)}</div>}
            {place.reel_url && (
              <button className="reel-link" onClick={openReel}>
                View Reel <ArrowUpRight className="ico" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <VoteBoard
          members={members}
          reactions={place.reactions}
          userId={userId}
          sharedBy={place.shared_by}
          placeName={place.name}
          onSetVibe={onSetVibe}
          showToast={showToast}
        />

        {booking && (
          <div className="modal-section">
            <div className="modal-label"><CalendarDays className="ico" aria-hidden="true" /> Planned Date</div>
            <button
              type="button"
              className="planned-date"
              onClick={() => addToCalendar({
                title: place.name,
                location: place.address,
                description: place.reel_url,
                start: booking.planned_at,
              })}
            >
              {formatDateTime(booking.planned_at)} · <CalendarPlus className="ico" aria-hidden="true" /> Add to calendar
            </button>
          </div>
        )}

        {place?.address && (
          <div className="modal-section">
            <div className="modal-label">Address</div>
            <a
              className="venue-address"
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${place.address} in Google Maps`}
            >
              {place.address}
            </a>
          </div>
        )}

        {(place?.website_url || place?.booking_url) && (
          <div className="modal-section">
            {place.website_url && (
              <a className="step-btn secondary full-width" href={place.website_url} target="_blank" rel="noreferrer">
                <Globe className="ico" aria-hidden="true" /> Open website <ArrowUpRight className="ico" aria-hidden="true" />
              </a>
            )}
            {place.booking_url && (
              <a className="step-btn primary full-width" href={place.booking_url} target="_blank" rel="noreferrer">
                <UtensilsCrossed className="ico" aria-hidden="true" /> Reserve a table <ArrowUpRight className="ico" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        {place?.url && (
          <div className="modal-section">
            <a className="step-btn secondary full-width" href={place.url} target="_blank" rel="noreferrer">
              <Link className="ico" aria-hidden="true" /> Open link <ArrowUpRight className="ico" aria-hidden="true" />
            </a>
          </div>
        )}

        {place?.phone && (
          <div className="modal-section">
            <div className="modal-label">Phone</div>
            <a className="venue-address" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}>
              {place.phone}
            </a>
          </div>
        )}

        {place?.menu_url && (
          <div className="modal-section">
            <a className="step-btn secondary full-width" href={place.menu_url} target="_blank" rel="noreferrer">
              <UtensilsCrossed className="ico" aria-hidden="true" /> View menu <ArrowUpRight className="ico" aria-hidden="true" />
            </a>
          </div>
        )}

        {place?.menu?.text && (
          <div className="modal-section">
            <details>
              <summary className="modal-label">Menu details</summary>
              <div className="venue-menu-text">{place.menu.text}</div>
            </details>
          </div>
        )}

        {hours.length > 0 && (
          <div className="modal-section">
            <div className="modal-label">Business Hours</div>
            <table className="hours-table">
              <tbody>
                {hours.map((h) => (
                  <tr key={h.days}>
                    <td>{h.days}</td>
                    <td>{h.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {booking?.done_at ? (
          <div className="step-complete"><CircleCheck className="ico" aria-hidden="true" /> Done — marked by {nameOf(booking.marked_by)}</div>
        ) : wasBooked ? (
          <button className="step-btn primary full-width" disabled={doneLocked} onClick={onMarkDone}>
            {doneLocked ? <><Hourglass className="ico" aria-hidden="true" /> Mark as Done in {formatWait(unlockAt - now)}</> : <><CircleCheck className="ico" aria-hidden="true" /> Mark as Done</>}
          </button>
        ) : (
          <>
            {step === 1 && (
              <div className="checklist-step">
                <div className="step-number">{stepLabel(1)}</div>
                <div className="step-title"><Clock className="ico" aria-hidden="true" /> Check Hours</div>
                <div className="step-description">{hoursSummary}</div>
                <div className="step-buttons">
                  <button className="step-btn primary" onClick={() => completeStep(1)}>
                    Yes, proceed
                  </button>
                  <button className="step-btn secondary" onClick={onClose}>
                    Not now
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="checklist-step">
                <div className="step-number">{stepLabel(2)}</div>
                <div className="step-title"><Link className="ico" aria-hidden="true" /> Book Reservation</div>
                <div className="step-description">Choose when you'd like to visit. We'll help you find a table.</div>
                <input
                  type="datetime-local"
                  className="step-input"
                  value={reservationDate}
                  onChange={(e) => setReservationDate(e.target.value)}
                />
                <div className="step-buttons">
                  {place?.booking_url && (
                    <button className="step-btn primary" onClick={openBooking}>
                      <Link className="ico" aria-hidden="true" /> {bookingLabel(place.booking_url)}
                    </button>
                  )}
                  <button className="step-btn secondary" onClick={callVenue}>
                    <Phone className="ico" aria-hidden="true" /> Call
                  </button>
                </div>
                <button
                  className="step-btn secondary full-width"
                  onClick={() => completeStep(2)}
                  disabled={saving || !reservationDate}
                >
                  {saving ? <><span className="spinner" aria-hidden="true" />Saving…</> : 'Save booking →'}
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="checklist-step">
                <div className="step-number">{stepLabel(3)}</div>
                <div className="step-title"><CalendarPlus className="ico" aria-hidden="true" /> Add to Calendar</div>
                <div className="step-description">Add this date to your calendar so you don't forget!</div>
                <input
                  type="text"
                  className="step-input"
                  value={calendarTitle}
                  onChange={(e) => setCalendarTitle(e.target.value)}
                />
                <div className="step-buttons">
                  <button className="step-btn primary" onClick={addToCalendar}>
                    <CalendarPlus className="ico" aria-hidden="true" /> Add to Calendar
                  </button>
                  <button className="step-btn secondary" onClick={() => completeStep(3)}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {step === 'final' && (
              <div className="checklist-step">
                <div className="step-number">All set!</div>
                <div className="step-title"><PartyPopper className="ico" aria-hidden="true" /> Ready to Go</div>
                <div className="step-description">
                  Everything is planned. You can mark this as "Done" once you've visited!
                </div>
                <div className="step-complete"><CircleCheck className="ico" aria-hidden="true" /> All steps completed</div>
                <button className="step-btn primary full-width mark-done" disabled={doneLocked} onClick={onMarkDone}>
                  {doneLocked ? <><Hourglass className="ico" aria-hidden="true" /> Available in {formatWait(unlockAt - now)}</> : <><CircleCheck className="ico" aria-hidden="true" /> Mark as Done</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${place.name}"?`}
          message="It will be removed from this collection and the map for everyone in it."
          warning={
            booking
              ? `You have a booking here for ${formatDateTime(booking.planned_at)}. Deleting the place won't cancel it with the venue — cancel that separately.`
              : null
          }
          confirmLabel={booking ? 'Delete anyway' : 'Delete'}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
