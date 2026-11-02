import React, { useState } from 'react';
import { CalendarCheck, ChevronDown, Eye, Flame, GripVertical, Lock, Map as MapIcon, MapPinPlus, PartyPopper, Plus, Sparkles, Sprout, Trash2, Users } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import PlaceList from './PlaceList';
import { PlaceCard } from './PlaceRow';
import MapBanner from './MapBanner';
import { categories, formatDateTime } from '../lib/constants';
import { dayShort, dayString, nextDay, runOn, runsOf, timesText } from '../lib/eventRuns';
import { readJSON, writeJSON } from '../lib/storage';

// How many reorders have been done on this device; the hint stops after a couple. An older `true` means learned.
const REORDER_LEARNED_KEY = 'reelmap:reorder-learned';
const REORDERS_TO_LEARN = 2;
// Collections closed on Home (ids), so Home opens the way it was left on this device.
const COLLAPSED_KEY = 'reelmap:collapsed-collections';

const MONTHS_AHEAD = 3;

// Up next picks one thing, in this order:
// 1. the soonest booking still to come,
// 2. the soonest unbooked event in the next three months,
// 3. a food or cafe place I'm keen on and nobody has booked (most keen votes first),
// 4. else a random food or cafe place I said maybe to (a new pick each day).
export function pickUpNext(places, userId, now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const horizon = new Date(startOfToday);
  horizon.setMonth(horizon.getMonth() + MONTHS_AHEAD);
  const open = places.filter((p) => !p.booking?.done_at);

  const booked = open
    .filter((p) => p.booking?.planned_at && new Date(p.booking.planned_at) >= startOfToday)
    .sort((a, b) => new Date(a.booking.planned_at) - new Date(b.booking.planned_at))[0];
  if (booked) return { kind: 'booked', place: booked };

  const unbooked = open.filter((p) => !p.booking?.planned_at);
  // An event counts from its next day on (today while it's on, or the start of its next run), and
  // shows that day. Days are plain days ("2026-10-17"), read as local midnight.
  const nextEventDay = (p) => nextDay(runsOf(p), dayString(startOfToday));
  const event = unbooked
    .filter((p) => p.category === 'event' && nextEventDay(p) && new Date(`${nextEventDay(p)}T00:00:00`) <= horizon)
    .sort((a, b) => nextEventDay(a).localeCompare(nextEventDay(b)))[0];
  if (event) return { kind: 'event', place: event, date: new Date(`${nextEventDay(event)}T00:00:00`) };

  const keenCount = (p) => Object.values(p.reactions ?? {}).filter((v) => v === 'keen').length;
  const eatOut = unbooked.filter((p) => p.category === 'food' || p.category === 'cafe');
  const keen = eatOut
    .filter((p) => p.reactions?.[userId] === 'keen')
    .sort((a, b) => keenCount(b) - keenCount(a))[0];
  if (keen) return { kind: 'keen', place: keen };
  // A random food or cafe place I said maybe to. Random per day, so it doesn't change every time Home redraws.
  const maybes = eatOut.filter((p) => p.reactions?.[userId] === 'maybe');
  if (maybes.length) {
    const day = Math.floor(startOfToday.getTime() / 86400000);
    return { kind: 'maybe', place: maybes[(day * 7919) % maybes.length] };
  }
  return null;
}

const TAGS = {
  booked: { Icon: CalendarCheck, label: 'Planned' },
  event: { Icon: PartyPopper, label: 'Coming up' },
  keen: { Icon: Flame, label: "You're keen" },
  maybe: { Icon: Sparkles, label: 'Still deciding' },
};

function formatEventDay(date) {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

// One plan worth looking at, shown as a ticket stub above the lists.
function UpNext({ places, collections, userId, onOpenPin }) {
  const pick = pickUpNext(places, userId);
  if (!pick) return null;
  const { kind, place } = pick;
  const collection = collections.find((c) => c.id === place.collection_id);
  const { Icon, label } = TAGS[kind];
  const when = kind === 'booked'
    ? formatDateTime(place.booking.planned_at)
    : kind === 'event'
      ? formatEventDay(pick.date)
      : 'No plan yet';

  return (
    <button type="button" className="ticket" onClick={() => onOpenPin(`${place.collection_id}:${place.id}`)}>
      <span className="ticket-cover">
        <MapBanner place={place} className="ticket-thumb" />
        <span className={`ticket-tag ticket-tag-${kind}`}><Icon className="ico" aria-hidden="true" /> {label}</span>
      </span>
      <span className="ticket-stub">
        <span className="ticket-title">{place.name}</span>
        <span className="ticket-when">
          {when}
          {collection && ` · ${collection.name}`}
        </span>
      </span>
    </button>
  );
}

// Bookings and events on today (the phone's own date), from every collection, done ones included:
// bookings by time, then events. An event on for several days shows on each of them.
export function placesToday(places, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isToday = (date) => new Date(date).toDateString() === now.toDateString();
  const booked = places
    .filter((p) => p.booking?.planned_at && isToday(p.booking.planned_at))
    .sort((a, b) => new Date(a.booking.planned_at) - new Date(b.booking.planned_at));
  const events = places.filter((p) => p.category === 'event' && runOn(runsOf(p), today) && !booked.includes(p));
  return [...booked, ...events];
}

// What to show under an event on today: "Event today", or "On until Sun 15 Nov" for a run of days,
// plus its times when it has them.
function eventTimeText(pin) {
  const run = runOn(runsOf(pin), dayString());
  if (!run) return 'Event today';
  const base = run.end > run.start ? `On until ${dayShort(run.end)}` : 'Event today';
  return run.open ? `${base} · ${timesText(run)}` : base;
}

// A calendar page with today's month and day, since the 📅 emoji always shows "JUL 17".
function TodayIcon({ now = new Date() }) {
  return (
    <span className="today-icon" aria-hidden="true">
      <span className="today-icon-month">{now.toLocaleDateString('en-AU', { month: 'short' })}</span>
      <span className="today-icon-day">{now.getDate()}</span>
    </span>
  );
}

// "Today": not a real collection, so it's never saved. It shows whatever is booked or on today
// (a place marked done still shows, with its Done tag),
// with each place's own collection underneath. No dragging or selecting: the places live elsewhere.
function TodayBoard({ places, collections, membersOf, userId, isOpen, onToggle, onOpenPin }) {
  const pins = placesToday(places);
  return (
    <div className={`collection-board ${isOpen ? '' : 'is-collapsed'}`} id="collection-today">
      <button
        type="button"
        className="collection-header collection-toggle"
        aria-expanded={isOpen}
        aria-controls="collection-body-today"
        onClick={onToggle}
      >
        <span className="collection-title">
          <TodayIcon /> Today
          <span className="collection-subtext">Bookings and events on today</span>
        </span>
        <span className="collection-count">{pins.length} {pins.length === 1 ? 'place' : 'places'}</span>
        <ChevronDown className="collection-chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div id="collection-body-today" className="collection-body">
          {pins.length === 0 && <div className="collection-empty">Nothing booked or on today.</div>}
          <div className="pin-list">
            {pins.map((pin) => {
              const open = () => onOpenPin(`${pin.collection_id}:${pin.id}`);
              const collection = collections.find((c) => c.id === pin.collection_id);
              const time = pin.booking?.planned_at
                ? new Date(pin.booking.planned_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
                : eventTimeText(pin);
              return (
                <div className="place-row" key={`${pin.collection_id}:${pin.id}`}>
                  <PlaceCard
                    pin={pin}
                    members={membersOf[pin.collection_id] ?? []}
                    userId={userId}
                    showDone
                    onClick={open}
                    onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
                  />
                  <div className="today-when">{time}{collection && ` · ${collection.emoji} ${collection.name}`}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomeScreen({
  userId,
  places,
  collections,
  membersOf,
  streak,
  onOpenPin,
  onReorder,
  onCreateSample,
  onOpenSettings,
  onAddPlace,
  onMovePlaces,
  onCopyPlaces,
  onDeletePlaces,
  onCreateCollection,
  canEdit = () => true,
  showToast,
  banner = null,
}) {
  // Press and hold a card to pick it up. Moving before the hold ends scrolls the list instead.
  const [reorders, setReorders] = useState(() => readJSON(REORDER_LEARNED_KEY, 0));
  const reorderLearned = reorders === true || reorders >= REORDERS_TO_LEARN;
  const markReorderLearned = () => {
    if (reorderLearned) return;
    const next = (Number(reorders) || 0) + 1;
    writeJSON(REORDER_LEARNED_KEY, next);
    setReorders(next);
  };
  const [collapsed, setCollapsed] = useState(() => new Set(readJSON(COLLAPSED_KEY, [])));
  const saveCollapsed = (next) => {
    setCollapsed(next);
    writeJSON(COLLAPSED_KEY, [...next]);
  };
  const toggleCollapsed = (id) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (id === selecting) stopSelecting();
    saveCollapsed(next);
  };
  // Select mode: tick several places in one collection, then move them all at once.
  // In a collection I only view, ticked places are copied instead: viewers can't move places out.
  const [selecting, setSelecting] = useState(null); // collection id
  const [picked, setPicked] = useState(() => new Map()); // place id -> place
  const [moveSheet, setMoveSheet] = useState(false);
  const [moving, setMoving] = useState(false);
  // "+ New collection" in the Move sheet: make one and move the ticked places straight into it.
  const [newName, setNewName] = useState(null); // null = form closed
  const [newEmoji, setNewEmoji] = useState('');
  const stopSelecting = () => {
    setSelecting(null);
    setPicked(new Map());
    setMoveSheet(false);
    setNewName(null);
  };
  const startSelecting = (collectionId) => {
    setSelecting(collectionId);
    setPicked(new Map());
  };
  // Only whoever added a place can move it, so the others can't be ticked. Anything can be copied.
  const copying = selecting !== null && !canEdit(selecting);
  const canMove = (pin) => pin.added_by === userId;
  const canPick = (pin) => !canEdit(pin.collection_id) || canMove(pin);
  const togglePick = (pin) => {
    if (!canPick(pin)) {
      showToast?.('Only the person who added this place can move it');
      return;
    }
    const next = new Map(picked);
    if (next.has(pin.id)) next.delete(pin.id);
    else next.set(pin.id, pin);
    setPicked(next);
  };
  // Same rule as the place card: my places, unless someone else booked them.
  const canDelete = (pin) => canEdit(pin.collection_id) && pin.added_by === userId && (!pin.booking || pin.booking.booked_by === userId);
  const deletePicked = () => {
    const pins = [...picked.values()].filter(canDelete);
    const skipped = picked.size - pins.length;
    if (!pins.length) {
      showToast?.("You can't delete these places");
      return;
    }
    onDeletePlaces?.(pins, skipped);
    stopSelecting();
  };
  // A "Tick all" chip is lit while every pickable place it covers is ticked. Tapping it then unticks them.
  const allTicked = (pins) => {
    const pickable = pins.filter(canPick);
    return pickable.length > 0 && pickable.every((p) => picked.has(p.id));
  };
  const tickAll = (pins) => {
    if (allTicked(pins)) {
      const covered = new Set(pins.map((p) => p.id));
      setPicked((now) => new Map([...now].filter(([id]) => !covered.has(id))));
    } else {
      setPicked(new Map(pins.filter(canPick).map((p) => [p.id, p])));
    }
  };
  // newCollection: name and emoji of a collection made just now, which isn't in the list yet.
  const moveTo = async (targetId, newCollection) => {
    setMoving(true);
    const send = copying ? onCopyPlaces : onMovePlaces;
    const ok = await send?.([...picked.values()], targetId, newCollection);
    setMoving(false);
    if (ok) stopSelecting();
    else setMoveSheet(false);
  };
  const createAndMove = async (event) => {
    event.preventDefault();
    const name = newName?.trim();
    if (!name || moving) return;
    setMoving(true);
    const emoji = newEmoji.trim() || '📌';
    const id = await onCreateCollection?.(name, emoji);
    setMoving(false);
    if (id) await moveTo(id, { name, emoji });
  };
  const closeMoveSheet = () => {
    if (moving) return;
    setMoveSheet(false);
    setNewName(null);
  };
  // Places can only go into collections I can change.
  const targets = collections.filter((c) => c.id !== selecting && canEdit(c.id));
  const allCollapsed = collections.length > 0 && collections.every((c) => collapsed.has(c.id));

  if (collections.length === 0) {
    return (
      <div className="screen">
        <div className="home-screen">
          <div className="empty-state">
            <div className="empty-emoji"><MapIcon aria-hidden="true" /></div>
            <h2>Start your first list</h2>
            <p>Collections hold the places you find in reels — date nights, brunch spots, gigs.</p>
            <button className="step-btn primary full-width" onClick={onOpenSettings}>
              <Plus className="ico" aria-hidden="true" /> Create a collection
            </button>
            <button className="step-btn secondary full-width" onClick={onCreateSample}>
              <MapPinPlus className="ico" aria-hidden="true" /> Add sample places to try it out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="home-screen">
        {banner}
        <UpNext places={places} collections={collections} userId={userId} onOpenPin={onOpenPin} />
        {!reorderLearned && places.length > 1 && (
          <div className="reorder-hint">Tip: drag <GripVertical className="ico" aria-hidden="true" /> to move a place</div>
        )}

        {collections.length > 1 && (
          <div className="collapse-all-row">
            <button
              type="button"
              className="collapse-all"
              onClick={() => saveCollapsed(allCollapsed ? new Set() : new Set(collections.map((c) => c.id)))}
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
        )}

        <TodayBoard
          places={places}
          collections={collections}
          membersOf={membersOf}
          userId={userId}
          isOpen={!collapsed.has('today')}
          onToggle={() => toggleCollapsed('today')}
          onOpenPin={onOpenPin}
        />

        {collections.map((collection) => {
          const pins = places.filter((p) => p.collection_id === collection.id);
          const members = membersOf[collection.id] ?? [];
          const isOpen = !collapsed.has(collection.id);
          const isSelecting = selecting === collection.id;
          const editable = canEdit(collection.id);
          const pickablePins = pins.filter(canPick);
          // "Tick all" shortcuts, only for the categories this collection has.
          const quickTicks = categories.filter((cat) => pickablePins.some((p) => p.category === cat.id));
          const hasTargets = collections.some((c) => c.id !== collection.id && canEdit(c.id));
          return (
            <div className={`collection-board ${isOpen ? '' : 'is-collapsed'}`} id={`collection-${collection.id}`} key={collection.id}>
              <button
                type="button"
                className="collection-header collection-toggle"
                aria-expanded={isOpen}
                aria-controls={`collection-body-${collection.id}`}
                onClick={() => toggleCollapsed(collection.id)}
              >
                <span className="collection-title">
                  {collection.emoji} {collection.name}
                  {collection.isPrivate && <Lock className="ico" aria-label="Locked" />}
                  {!editable && <span className="viewer-tag"><Eye className="ico" aria-hidden="true" /> Viewer</span>}
                  {collection.isInbox && <span className="collection-subtext">Shared reels land here</span>}
                </span>
                <span className="collection-count">
                  {members.length > 1 && <><Users className="ico" aria-hidden="true" /> {members.length} · </>}
                  {pins.length} {pins.length === 1 ? 'place' : 'places'}
                </span>
                <ChevronDown className="collection-chevron" aria-hidden="true" />
              </button>

              {isOpen && (
                <div id={`collection-body-${collection.id}`} className="collection-body">
                  {pins.length === 0 && !editable && (
                    <div className="collection-empty">No places yet.</div>
                  )}
                  {pins.length === 0 && editable && (
                    <button type="button" className="collection-empty" onClick={() => onAddPlace(collection.id)}>
                      No places yet — tap <Plus className="ico" aria-hidden="true" /> to add one.
                    </button>
                  )}

                  {pickablePins.length > 0 && hasTargets && (
                    <div className={`select-row ${isSelecting ? 'is-on' : ''}`}>
                      {isSelecting && (
                        <div className="select-quick" role="group" aria-label="Tick all">
                          <span className="select-quick-label">Tick all:</span>
                          {quickTicks.length > 1 && quickTicks.map((cat) => (
                            <button key={cat.id} type="button" className={`select-chip ${allTicked(pins.filter((p) => p.category === cat.id)) ? 'is-on' : ''}`}
                              aria-pressed={allTicked(pins.filter((p) => p.category === cat.id))}
                              onClick={() => tickAll(pins.filter((p) => p.category === cat.id))}>
                              {cat.icon} {cat.label}
                            </button>
                          ))}
                          <button type="button" className={`select-chip ${allTicked(pins) ? 'is-on' : ''}`} aria-pressed={allTicked(pins)} onClick={() => tickAll(pins)}>Everything</button>
                        </div>
                      )}
                      <button
                        type="button"
                        className="select-toggle"
                        aria-pressed={isSelecting}
                        onClick={() => (isSelecting ? stopSelecting() : startSelecting(collection.id))}
                      >
                        {isSelecting ? 'Cancel' : 'Select'}
                      </button>
                    </div>
                  )}

                  <PlaceList
                    pins={pins}
                    selecting={isSelecting}
                    picked={picked}
                    onToggle={togglePick}
                    members={members}
                    userId={userId}
                    onOpen={onOpenPin}
                    onReorder={(ids) => onReorder(ids, collection.id)}
                    onReordered={markReorderLearned}
                  />
                </div>
              )}
            </div>
          );
        })}

        {selecting && picked.size > 0 && !moveSheet && (
          <div className="select-bar" role="region" aria-label="Selected places">
            <span className="select-bar-count">{picked.size} selected</span>
            {!copying && (
              <button type="button" className="select-bar-delete" onClick={deletePicked} aria-label={`Delete ${picked.size} selected`}>
                <Trash2 aria-hidden="true" /> Delete
              </button>
            )}
            <button type="button" className="select-bar-move" onClick={() => setMoveSheet(true)}>{copying ? 'Copy to…' : 'Move to…'}</button>
          </div>
        )}

        {moveSheet && (
          <div className="modal-overlay" onClick={closeMoveSheet}>
            <div className="modal move-sheet" role="dialog" aria-modal="true" aria-labelledby="move-sheet-title" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title" id="move-sheet-title">
                  {copying ? 'Copy' : 'Move'} {picked.size} {picked.size === 1 ? 'place' : 'places'} to
                </div>
              </div>
              <div className="move-list">
                {targets.map((c) => (
                  <button key={c.id} type="button" className="move-option" disabled={moving} onClick={() => moveTo(c.id)}>
                    <span className="move-option-emoji" aria-hidden="true">{c.emoji}</span>
                    <span className="move-option-name">{c.name}</span>
                    <span className="move-option-count">{places.filter((p) => p.collection_id === c.id).length}</span>
                  </button>
                ))}
                {newName === null ? (
                  <button type="button" className="move-option move-new" disabled={moving} onClick={() => { setNewName(''); setNewEmoji(''); }}>
                    <Plus className="ico" aria-hidden="true" /> New collection
                  </button>
                ) : (
                  <form className="move-new-form" onSubmit={createAndMove}>
                    <EmojiPicker value={newEmoji} onChange={setNewEmoji} placeholder="📌" label="Collection emoji" />
                    <input
                      className="step-input move-new-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Collection name"
                      maxLength={60}
                      aria-label="New collection name"
                      autoFocus
                    />
                    <button type="submit" className="step-btn primary move-new-go" disabled={moving || !newName.trim()}>
                      {copying ? 'Make & copy' : 'Make & move'}
                    </button>
                  </form>
                )}
              </div>
              <button type="button" className="step-btn secondary full-width" disabled={moving} onClick={closeMoveSheet}>
                {moving ? (copying ? 'Copying…' : 'Moving…') : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        <div className="streak">
          {streak > 0
            ? <><Flame className="ico" aria-hidden="true" /> Streak: {streak} {streak === 1 ? 'adventure' : 'adventures'} this month</>
            : <><Sprout className="ico" aria-hidden="true" /> No adventures yet this month — book one!</>}
        </div>
      </div>
    </div>
  );
}
