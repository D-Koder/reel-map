import React, { useEffect, useState } from 'react';
import { feelings, formatDate, formatDateTime, getVibe, toLocalInputValue } from '../lib/constants';
import ConfirmDialog from './ConfirmDialog';
import PlaceThumb from './PlaceThumb';

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
  const venue = place.venue;
  const booking = place.booking;
  const nameOf = (id) => (id === userId ? 'you' : members.find((m) => m.id === id)?.display_name ?? 'someone else');
  const sharerName = place.shared_by === userId ? 'you' : place.sharer?.display_name ?? 'someone';

  // Whoever added the place edits it. Delete: the booker if booked, otherwise whoever added it.
  const canEdit = place.added_by === userId;
  const canDelete = booking ? booking.booked_by === userId : place.added_by === userId;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Decided once, when the sheet opens: an already-booked place skips the checklist entirely,
  // while one booked mid-flow keeps going to the calendar step.
  const [wasBooked] = useState(Boolean(booking));
  const steps = [1, 2, 3];
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [reservationDate, setReservationDate] = useState(defaultReservation);
  const [calendarTitle, setCalendarTitle] = useState(`${place.name}`);
  const [now, setNow] = useState(() => Date.now());

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
    showToast(`✓ Step ${steps.indexOf(stepNum) + 1} complete`);
    const next = steps[steps.indexOf(stepNum) + 1];
    setStep(next ?? 'final');
  };

  const openReel = () => {
    if (!place.reel_url) return;
    window.open(place.reel_url, '_blank', 'noopener');
  };

  const openBooking = () => {
    showToast(`🔗 Opening ${bookingLabel(venue.booking_url)}...`);
    window.open(venue.booking_url, '_blank', 'noopener');
  };

  const callVenue = () => {
    if (venue?.phone) window.location.href = `tel:${venue.phone.replace(/[^\d+]/g, '')}`;
    else showToast('📞 No phone number listed');
  };

  const addToCalendar = () => {
    showToast(`📅 Added "${calendarTitle}" to calendar`);
    completeStep(3);
  };

  const hours = Array.isArray(venue?.hours) ? venue.hours : [];
  const satHours = hours.find((h) => /sat/i.test(h.days));
  const hoursSummary = hours.length
    ? `${place.name} is open ${satHours ? `Saturday ${satHours.time}` : `${hours[0].days} ${hours[0].time}`}. Does that work for you?`
    : "We don't have opening hours for this place yet — check before you go.";

  const unlockAt = booking ? new Date(booking.planned_at).getTime() + 60 * 60 * 1000 : null;
  const doneLocked = unlockAt !== null && now < unlockAt;
  const vibe = getVibe(
    members.map((m) => m.id),
    place.reactions
  );
  const stepLabel = (n) => `Step ${steps.indexOf(n) + 1} of ${steps.length}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={place.name}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="modal-header">
          <div className="modal-title">{place.name}</div>
          <div className="modal-header-actions">
            {canEdit && (
              <button className="modal-close" onClick={onEdit} aria-label="Edit place" title="Edit">
                ✏️
              </button>
            )}
            {canDelete && (
              <button
                className="modal-close"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete place"
                title="Delete"
              >
                🗑️
              </button>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {venue?.subtitle && <div className="venue-subtitle">{venue.subtitle}</div>}

        <div className="reel-context">
          <button className="reel-thumb-btn" onClick={openReel} aria-label="View reel" disabled={!place.reel_url}>
            <PlaceThumb place={place} className="reel-thumbnail-small" />
          </button>
          <div className="reel-info-small">
            <div className="reel-sender">Sent by {sharerName}</div>
            <div className="reel-date">{formatDate(place.created_at)}</div>
            {booking && <div className="reel-booked">🟢 Booked by {nameOf(booking.booked_by)}</div>}
            {place.reel_url && (
              <button className="reel-link" onClick={openReel}>
                View Reel ↗
              </button>
            )}
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-label">Who's keen · {vibe.label}</div>
          <div className="people-list">
            {members.map((person) => {
              const mine = person.id === userId;
              const feeling = feelings.find((f) => f.id === place.reactions[person.id]);
              return (
                <div className={`person-row ${mine ? 'mine' : ''}`} key={person.id}>
                  <span className="person-avatar">{person.avatar}</span>
                  <span className="person-name">
                    {mine ? 'You' : person.display_name}
                    {person.id === place.shared_by && <span className="person-tag">shared reel</span>}
                  </span>
                  {mine ? (
                    <div className="segmented" role="radiogroup" aria-label="Your vibe">
                      {feelings.map((f) => (
                        <button
                          type="button"
                          key={f.id}
                          role="radio"
                          aria-checked={feeling?.id === f.id}
                          aria-label={f.label}
                          title={f.label}
                          className={`segment ${feeling?.id === f.id ? 'selected' : ''}`}
                          onClick={() => onSetVibe(f.id)}
                        >
                          {f.emoji}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="person-feeling">
                      <span className="person-feeling-emoji">{feeling?.emoji ?? '—'}</span>
                      {feeling?.label ?? 'No vote'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {booking && (
          <div className="modal-section">
            <div className="modal-label">📅 Planned Date</div>
            <div className="planned-date">{formatDateTime(booking.planned_at)}</div>
          </div>
        )}

        {venue?.address && (
          <div className="modal-section">
            <div className="modal-label">Address</div>
            <div className="venue-address">{venue.address}</div>
            {venue.source_id?.startsWith('https://www.google.com/maps/') && (
              <a className="step-btn secondary full-width" href={venue.source_id} target="_blank" rel="noreferrer">
                📍 Open Google Maps ↗
              </a>
            )}
          </div>
        )}

        {(venue?.website_url || venue?.booking_url) && (
          <div className="modal-section">
            {venue.website_url && (
              <a className="step-btn secondary full-width" href={venue.website_url} target="_blank" rel="noreferrer">
                🌐 Open website ↗
              </a>
            )}
            {venue.booking_url && (
              <a className="step-btn primary full-width" href={venue.booking_url} target="_blank" rel="noreferrer">
                🍽️ Reserve a table ↗
              </a>
            )}
          </div>
        )}

        {venue?.phone && (
          <div className="modal-section">
            <div className="modal-label">Phone</div>
            <a className="venue-address" href={`tel:${venue.phone.replace(/[^\d+]/g, '')}`}>
              {venue.phone}
            </a>
          </div>
        )}

        {venue?.menu_url && (
          <div className="modal-section">
            <a className="step-btn secondary full-width" href={venue.menu_url} target="_blank" rel="noreferrer">
              🍽️ View menu ↗
            </a>
          </div>
        )}

        {venue?.menu?.text && (
          <div className="modal-section">
            <details>
              <summary className="modal-label">Menu details</summary>
              <div className="venue-menu-text">{venue.menu.text}</div>
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

        {place.visit ? (
          <div className="step-complete">✅ Done — marked by {nameOf(place.visit.marked_by)}</div>
        ) : wasBooked ? (
          <button className="step-btn primary full-width" disabled={doneLocked} onClick={onMarkDone}>
            {doneLocked ? `⏳ Mark as Done in ${formatWait(unlockAt - now)}` : '✅ Mark as Done'}
          </button>
        ) : (
          <>
            {step === 1 && (
              <div className="checklist-step">
                <div className="step-number">{stepLabel(1)}</div>
                <div className="step-title">✓ Check Hours</div>
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
                <div className="step-title">🔗 Book Reservation</div>
                <div className="step-description">Choose when you'd like to visit. We'll help you find a table.</div>
                <input
                  type="datetime-local"
                  className="step-input"
                  value={reservationDate}
                  onChange={(e) => setReservationDate(e.target.value)}
                />
                <div className="step-buttons">
                  {venue?.booking_url && (
                    <button className="step-btn primary" onClick={openBooking}>
                      🔗 {bookingLabel(venue.booking_url)}
                    </button>
                  )}
                  <button className="step-btn secondary" onClick={callVenue}>
                    📞 Call
                  </button>
                </div>
                <button
                  className="step-btn secondary full-width"
                  onClick={() => completeStep(2)}
                  disabled={saving || !reservationDate}
                >
                  {saving ? 'Saving…' : 'Save booking →'}
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="checklist-step">
                <div className="step-number">{stepLabel(3)}</div>
                <div className="step-title">📅 Add to Calendar</div>
                <div className="step-description">Add this date to your calendar so you don't forget!</div>
                <input
                  type="text"
                  className="step-input"
                  value={calendarTitle}
                  onChange={(e) => setCalendarTitle(e.target.value)}
                />
                <div className="step-buttons">
                  <button className="step-btn primary" onClick={addToCalendar}>
                    📅 Add to Calendar
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
                <div className="step-title">🎉 Ready to Go</div>
                <div className="step-description">
                  Everything is planned. You can mark this as "Done" once you've visited!
                </div>
                <div className="step-complete">✓ All steps completed</div>
                <button className="step-btn primary full-width mark-done" disabled={doneLocked} onClick={onMarkDone}>
                  {doneLocked ? `⏳ Available in ${formatWait(unlockAt - now)}` : '✅ Mark as Done'}
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
