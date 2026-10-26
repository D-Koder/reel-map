import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarCheck, CalendarDays, CalendarPlus, CircleCheck, Clock, Globe, Hourglass, Link, MapPin, Navigation, PartyPopper, Pencil, Phone, Share2, Ticket, Trash2, TriangleAlert, UtensilsCrossed, X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { feelings, formatDate, formatDateTime, toLocalInputValue } from '../lib/constants';
import { addToCalendar } from '../lib/calendar';
import { apiFetch } from '../lib/api';
import { shareBooking, sharePlace } from '../lib/share';
import BookingFiles from './BookingFiles';
import ConfirmDialog from './ConfirmDialog';
import PlaceThumb from './PlaceThumb';
import ReelEmbedThumb, { reelEmbed } from './ReelEmbedThumb';
import Avatar from './Avatar';
import { checkedGoogleMapsLink, googleMapsLink } from '../lib/places';
import { groupedHours, openStatus, suburbOf } from '../lib/hours';
import { busyFor, savedConnection } from '../lib/calendarLink';
import { NeedsGoogleTap } from '../lib/googleCalendar';
import { DEFAULT_PLAN_MINUTES, slotChip, slotLabel, suggestSlots } from '../lib/freeSlot';
import TimePicker from './TimePicker';
import { eventStatus, eventSummary, runsOf } from '../lib/eventRuns';
import EventSchedule from './EventSchedule';
import CalendarConnect from './CalendarConnect';

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
    const text = `Are you keen on ${placeName}? Vote in Waylit Maps`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Waylit Maps', text, url });
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
  // False in a collection I only view: no delete or booking, just votes and copying.
  canEdit = true,
}) {
  const booking = place.booking;
  const nameOf = (id) => (id === userId ? 'you' : members.find((m) => m.id === id)?.display_name ?? 'someone else');
  const adderName = place.added_by === userId ? 'you' : members.find((m) => m.id === place.added_by)?.display_name ?? 'someone';

  // Every member can open the place sheet to copy it. Only whoever added it can change it (the sheet enforces that).
  // Delete: whoever made the plan if there is one, otherwise whoever added it.
  const canDelete = canEdit && (booking ? booking.booked_by === userId : place.added_by === userId);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The warning button sends a debug comment about this place to the debug table.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportComment, setReportComment] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const sendReport = async () => {
    setReportStatus('sending');
    try {
      const response = await apiFetch('/api/report-lookup', {
        body: JSON.stringify({
          reelUrl: place.reel_url || '',
          placeName: place.name,
          location: place.address || '',
          comment: reportComment,
          reason: `Reported from place card (${place.collection_id}:${place.id})`,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setReportStatus('sent');
      setReportComment('');
    } catch {
      setReportStatus('failed');
    }
  };
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
  // Step 1 compares the place's hours with the person's calendar: 'none' (not connected), 'checking',
  // 'tap' (Google is connected but needs a tap this visit), 'failed', or 'ready' with up to 4 times they're free
  // and it's open. `busy` is what the calendar says they're doing.
  const [connection, setConnection] = useState(() => savedConnection(userId));
  const [freeTime, setFreeTime] = useState({ state: connection.kind ? 'checking' : 'none', busy: [] });
  // How long the plan lasts, 30 minutes to an hour: it decides which times are free and the calendar event's length.
  const [planMinutes, setPlanMinutes] = useState(DEFAULT_PLAN_MINUTES);
  // Step 1: which free time is picked, and whether the person is choosing their own time instead.
  const [pickedSlot, setPickedSlot] = useState(0);
  const [ownTime, setOwnTime] = useState(false);
  // The time set in step 1 (an event takes its time in step 2 instead).
  const [timeChosen, setTimeChosen] = useState(false);
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

  // Step 3: opens the planned date as a calendar event.
  const saveToCalendar = () => {
    addToCalendar({
      title: calendarTitle.trim() || place.name,
      location: place.address,
      description: place.reel_url,
      start: booking?.planned_at ?? new Date(reservationDate).toISOString(),
      minutes: planMinutes,
    });
    showToast(`Added "${calendarTitle}" to calendar`);
    completeStep(3);
  };

  const hours = Array.isArray(place?.hours) ? place.hours : [];
  useEffect(() => {
    if (!connection.kind || !hours.length) {
      setFreeTime({ state: 'none', busy: [] });
      return undefined;
    }
    const controller = new AbortController();
    setFreeTime({ state: 'checking', busy: [] });
    setPickedSlot(0);
    const from = new Date();
    busyFor(connection, from, new Date(from.getTime() + 15 * 24 * 60 * 60 * 1000), controller.signal)
      .then((busy) => !controller.signal.aborted && setFreeTime({ state: 'ready', busy }))
      .catch((error) => !controller.signal.aborted && setFreeTime({ state: error instanceof NeedsGoogleTap ? 'tap' : 'failed', busy: [] }));
    return () => controller.abort();
  }, [connection, place.id, place.hours]); // eslint-disable-line react-hooks/exhaustive-deps
  // Shown next to the reel: open now, suburb, and one-tap links. Each only when the place has it.
  // An event is on at its own times, not the venue's hours (a park is "open 24 hours").
  const runs = place?.category === 'event' ? runsOf(place) : [];
  const hasRuns = runs.length > 0;
  const eventNow = hasRuns ? eventStatus(runs) : null;
  const status = hasRuns ? (eventNow && { open: eventNow.kind === 'open', text: eventNow.text }) : openStatus(hours);
  const suburb = suburbOf(place?.address);
  const quickActions = [
    place?.address && mapsLink && { label: 'Directions', href: mapsLink, Icon: Navigation },
    place?.phone && { label: `Call ${place.phone}`, href: `tel:${place.phone.replace(/[^\d+]/g, '')}`, Icon: Phone },
    place?.website_url && { label: 'Website', href: place.website_url, Icon: Globe },
    place?.menu_url && { label: 'Menu', href: place.menu_url, Icon: UtensilsCrossed },
    place?.booking_url && { label: 'Reserve a table', href: place.booking_url, Icon: Ticket },
    place?.url && { label: 'Open link', href: place.url, Icon: Link },
  ].filter(Boolean);
  // Step 1 text. No calendar, no suggested time: the hours are all there is to show.
  const slots = useMemo(
    () => (freeTime.state === 'ready' ? suggestSlots(hours, freeTime.busy, new Date(), 4, planMinutes) : []),
    [freeTime, planMinutes, place.hours], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hoursSummary = hasRuns
    ? eventSummary(place.name, runs, place.event_price)
    : freeTime.state === 'checking'
    ? 'Checking your calendar…'
    : freeTime.state === 'tap'
    ? 'Tap below to check your Google Calendar for times you\'re free.'
    : freeTime.state === 'failed'
    ? "Couldn't read your calendar. Check the link or reconnect it."
    : freeTime.state === 'ready'
    ? (slots.length ? "Times you're free, when it's open." : `You have no free time in the next 2 weeks when ${place.name} is open.`)
    : !hours.length
    ? "We don't have opening hours for this place yet, so check before you go."
    : "Connect your calendar and we'll show times you're free.";
  const chosenSlot = !ownTime ? slots[pickedSlot] : null;
  // The booking help in step 2: only what this place has.
  const bookingActions = [
    place?.booking_url && { label: bookingLabel(place.booking_url), href: place.booking_url, Icon: Ticket, primary: true },
    place?.website_url && { label: 'Website', href: place.website_url, Icon: Globe },
    place?.phone && { label: `Call ${place.phone}`, href: `tel:${place.phone.replace(/[^\d+]/g, '')}`, Icon: Phone },
  ].filter(Boolean);
  const planDay = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + new Date(iso).getDate() + ' ' + new Date(iso).toLocaleDateString(undefined, { month: 'short' });

  const unlockAt = booking ? new Date(booking.planned_at).getTime() + 60 * 60 * 1000 : null;
  const doneLocked = unlockAt !== null && now < unlockAt;
  const stepNames = { 1: hasRuns ? 'Check times' : 'Pick a time', 2: 'Book', 3: 'Calendar' };
  // Going back only changes the step shown: a saved plan stays.
  const prevStep = (n) => steps[steps.indexOf(n) - 1];
  const stepHead = (n) => (
    <>
      <div className="step-progress" role="img" aria-label={`Step ${steps.indexOf(n) + 1} of ${steps.length}: ${stepNames[n]}`}>
        {steps.map((s) => (
          <span key={s} className={s < n ? 'done' : s === n ? 'on' : ''}>{stepNames[s]}</span>
        ))}
      </div>
      {prevStep(n) && (
        <button type="button" className="step-back" onClick={() => setStep(prevStep(n))}>← Back</button>
      )}
    </>
  );

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
            <button
              className="modal-close"
              onClick={() => { setReportOpen((open) => !open); setReportStatus(''); }}
              aria-label="Add a debug comment"
              title="Add a debug comment"
            >
              <TriangleAlert aria-hidden="true" />
            </button>
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

        {reportOpen && (
          <div className="field" style={{ marginBottom: 12 }}>
            <span className="modal-label">Debug comment</span>
            <textarea
              value={reportComment}
              onChange={(e) => setReportComment(e.target.value)}
              placeholder="What's wrong with this place?"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <button type="button" disabled={reportStatus === 'sending' || !reportComment.trim()} onClick={sendReport}>
              {reportStatus === 'sending' ? 'Sending…' : 'Send'}
            </button>
            {reportStatus === 'sent' && <span> Sent, thank you.</span>}
            {reportStatus === 'failed' && <span> Could not send. Try again.</span>}
          </div>
        )}

        {place?.subtitle && <div className="venue-subtitle">{place.subtitle}</div>}
        {place?.custom_info && <div className="venue-subtitle">{place.custom_info}</div>}

        <div className={`reel-context${reelEmbed(place.reel_url) ? ' has-embed' : ''}`}>
          <button className="reel-thumb-btn" onClick={openReel} aria-label="View reel" disabled={!place.reel_url}>
            {/* Instagram and TikTok reels show the platform's own embed, shrunk to fit; anything else shows the saved cover. */}
            {reelEmbed(place.reel_url)
              ? <ReelEmbedThumb reelUrl={place.reel_url} mapsUrl={place.maps_url} className="reel-thumbnail-small" />
              : <PlaceThumb place={place} className="reel-thumbnail-small" />}
          </button>
          <div className="reel-info-small">
            <div className="reel-sender">Added by {adderName}</div>
            <div className="reel-date">{formatDate(place.created_at)}</div>
            {booking && <div className="reel-booked"><CalendarCheck className="ico" aria-hidden="true" /> Planned by {nameOf(booking.booked_by)}</div>}
            {status && (
              <div className={`reel-open ${status.open ? 'is-open' : 'is-closed'}`}>
                <span className="reel-open-dot" aria-hidden="true" /> {status.text}
              </div>
            )}
            {suburb && <div className="reel-suburb"><MapPin className="ico" aria-hidden="true" /> {suburb}</div>}
            {quickActions.length > 0 && (
              <div className="quick-actions">
                {quickActions.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    className="quick-action"
                    href={href}
                    target={href.startsWith('tel:') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                  >
                    <Icon aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
            {/* A link to this place in waylit maps. The reel itself opens from the thumbnail. */}
            <button className="reel-link" onClick={() => sharePlace(place, showToast)}>
              <Share2 className="ico" aria-hidden="true" /> Share place
            </button>
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
            {/* For the people in this collection: the link's card shows the date and time. */}
            <button type="button" className="step-btn secondary full-width share-booking" onClick={() => shareBooking(place, showToast)}>
              <Share2 className="ico" aria-hidden="true" /> Share booking with the group
            </button>
            <BookingFiles place={place} canUpload={canEdit} showToast={showToast} />
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

        {place?.menu?.text && (
          <div className="modal-section">
            <details>
              <summary className="modal-label">Menu details</summary>
              <div className="venue-menu-text">{place.menu.text}</div>
            </details>
          </div>
        )}

        {place?.category === 'event' && <EventSchedule place={place} />}

        {!hasRuns && hours.length > 0 && (
          <div className="modal-section">
            <div className="modal-label">Business Hours</div>
            <table className="hours-table">
              <tbody>
                {groupedHours(hours).map((h) => (
                  <tr key={h.days}>
                    <td>{h.days}</td>
                    <td>{h.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!canEdit && !booking?.done_at ? (
          <div className="place-collection-note">
            {booking?.planned_at ? `Planned for ${formatDateTime(booking.planned_at)}. ` : ''}You're a viewer here, so the owner or an editor plans and marks it done.
          </div>
        ) : booking?.done_at ? (
          <div className="step-complete"><CircleCheck className="ico" aria-hidden="true" /> Done — marked by {nameOf(booking.marked_by)}</div>
        ) : wasBooked ? (
          <button className="step-btn primary full-width" disabled={doneLocked} onClick={onMarkDone}>
            {doneLocked ? <><Hourglass className="ico" aria-hidden="true" /> Mark as Done in {formatWait(unlockAt - now)}</> : <><CircleCheck className="ico" aria-hidden="true" /> Mark as Done</>}
          </button>
        ) : (
          <>
            {step === 1 && (
              <div className="checklist-step">
                {stepHead(1)}
                {hasRuns ? (
                  <>
                    <div className="step-title"><Clock className="ico" aria-hidden="true" /> Check times</div>
                    <div className="step-description">{hoursSummary}</div>
                    <div className="step-buttons">
                      <button className="step-btn primary" onClick={() => completeStep(1)}>Yes, proceed</button>
                      <button className="step-btn secondary" onClick={onClose}>Not now</button>
                    </div>
                  </>
                ) : ownTime || !hours.length ? (
                  <>
                    <div className="step-title">Choose a time</div>
                    {!hours.length && <div className="step-description">{hoursSummary}</div>}
                    {hours.length > 0 ? (
                      <TimePicker
                        hours={hours}
                        busy={freeTime.busy}
                        connected={freeTime.state === 'ready'}
                        minutes={planMinutes}
                        onMinutes={setPlanMinutes}
                        onPick={(start) => { setReservationDate(toLocalInputValue(start)); setTimeChosen(true); completeStep(1); }}
                      />
                    ) : (
                      <>
                        <input
                          type="datetime-local"
                          className="step-input"
                          value={reservationDate}
                          onChange={(e) => setReservationDate(e.target.value)}
                        />
                        <button
                          className="step-btn primary full-width"
                          disabled={!reservationDate}
                          onClick={() => { setTimeChosen(true); completeStep(1); }}
                        >
                          Pick this time
                        </button>
                      </>
                    )}
                    {hours.length > 0 && <button type="button" className="step-link" onClick={() => setOwnTime(false)}>Back</button>}
                  </>
                ) : (
                  <>
                    <div className="step-title">Pick a time</div>
                    <div className="step-description">{hoursSummary}</div>
                    {slots.length > 0 && (
                      <div className="slot-chips" role="group" aria-label="Free times">
                        {slots.map((slot, i) => (
                          <button
                            key={slot.start.getTime()}
                            type="button"
                            className="slot-chip"
                            aria-pressed={i === pickedSlot}
                            onClick={() => setPickedSlot(i)}
                          >
                            {slotChip(slot.start)}
                          </button>
                        ))}
                      </div>
                    )}
                    {chosenSlot && (
                      <button
                        className="step-btn primary full-width"
                        onClick={() => {
                          setReservationDate(toLocalInputValue(chosenSlot.start));
                          setTimeChosen(true);
                          completeStep(1);
                        }}
                      >
                        Pick {slotLabel(chosenSlot.start)}
                      </button>
                    )}
                    {!connection.kind && <CalendarConnect userId={userId} connection={connection} needsTap={false} onChange={setConnection} />}
                    {freeTime.state !== 'checking' && (
                      <button type="button" className="step-link" onClick={() => setOwnTime(true)}>
                        {slots.length ? 'Choose another time' : "I'll choose a time myself"}
                      </button>
                    )}
                    {connection.kind && <CalendarConnect userId={userId} connection={connection} needsTap={freeTime.state === 'tap'} onChange={setConnection} />}
                  </>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="checklist-step">
                {stepHead(2)}
                <div className="step-title">Book it</div>
                {timeChosen ? (
                  <div className="picked-time">
                    <div><small>Your time</small><strong>{formatDateTime(new Date(reservationDate).toISOString())}</strong></div>
                    <button type="button" className="step-link" onClick={() => setStep(1)}>Change</button>
                  </div>
                ) : (
                  <input
                    type="datetime-local"
                    className="step-input"
                    value={reservationDate}
                    onChange={(e) => setReservationDate(e.target.value)}
                  />
                )}
                {bookingActions.length > 0 ? (
                  <>
                    <div className="step-description">Book with the venue yourself. We don't book for you.</div>
                    <div className="book-actions">
                      {bookingActions.map(({ label, href, Icon, primary }) => (
                        <a
                          key={label}
                          className={`step-btn ${primary ? 'primary' : 'secondary'} book-link`}
                          href={href}
                          target={href.startsWith('tel:') ? undefined : '_blank'}
                          rel="noopener noreferrer"
                        >
                          <Icon className="ico" aria-hidden="true" /> {label}
                        </a>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="book-empty">
                    <b>No way to book saved for this place</b>
                    No phone number, booking link or reservation link. You can still plan the time and carry on.
                  </div>
                )}
                <button
                  className="step-btn primary full-width"
                  onClick={() => completeStep(2)}
                  disabled={saving || !reservationDate}
                >
                  {saving ? <><span className="spinner" aria-hidden="true" />Saving…</> : 'Next →'}
                </button>
                <div className="step-note">Next saves the plan, so friends can see it.</div>
                <BookingFiles place={place} canUpload={canEdit} showToast={showToast} />
              </div>
            )}

            {step === 3 && (
              <div className="checklist-step">
                {stepHead(3)}
                <div className="step-saved">
                  <span className="step-saved-mark"><CircleCheck className="ico" aria-hidden="true" /></span>
                  <div className="step-title">Planned for {planDay(booking?.planned_at ?? new Date(reservationDate).toISOString())}</div>
                  <div className="step-description">
                    {formatDateTime(booking?.planned_at ?? new Date(reservationDate).toISOString())}. Saved for everyone in this collection.
                  </div>
                </div>
                <input
                  type="text"
                  className="step-input"
                  value={calendarTitle}
                  onChange={(e) => setCalendarTitle(e.target.value)}
                  aria-label="Calendar event title"
                />
                <button className="step-btn primary full-width" onClick={saveToCalendar}>
                  <CalendarPlus className="ico" aria-hidden="true" /> Add to my calendar
                </button>
                <button type="button" className="step-link" onClick={() => completeStep(3)}>Done</button>
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
              ? `You have a plan here for ${formatDateTime(booking.planned_at)}. Deleting the place won't cancel a booking you made with the venue, so cancel that separately.`
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
