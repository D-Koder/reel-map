import React, { useState } from 'react';
import { CalendarCheck, Flame, GripVertical, Lock, Map as MapIcon, MapPinPlus, PartyPopper, Plus, Sparkles, Sprout, Users } from 'lucide-react';
import PlaceList from './PlaceList';
import PlaceThumb from './PlaceThumb';
import { formatDateTime } from '../lib/constants';
import { readJSON, writeJSON } from '../lib/storage';

// Set after the first reorder, so the hint stops showing on this device.
const REORDER_LEARNED_KEY = 'reelmap:reorder-learned';

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
  // event_date is a plain day ("2026-10-17"), read as local midnight.
  const eventDay = (p) => new Date(`${p.event_date}T00:00:00`);
  const event = unbooked
    .filter((p) => p.category === 'event' && p.event_date && eventDay(p) >= startOfToday && eventDay(p) <= horizon)
    .sort((a, b) => eventDay(a) - eventDay(b))[0];
  if (event) return { kind: 'event', place: event, date: eventDay(event) };

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
  booked: { Icon: CalendarCheck, label: 'Booked' },
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
      : 'Not booked yet';

  return (
    <button type="button" className="ticket" onClick={() => onOpenPin(`${place.collection_id}:${place.id}`)}>
      <span className="ticket-cover">
        <PlaceThumb place={place} className="ticket-thumb" />
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
  banner = null,
}) {
  // Press and hold a card to pick it up. Moving before the hold ends scrolls the list instead.
  const markReorderLearned = () => {
    if (reorderLearned) return;
    writeJSON(REORDER_LEARNED_KEY, true);
    setReorderLearned(true);
  };
  const [reorderLearned, setReorderLearned] = useState(() => readJSON(REORDER_LEARNED_KEY, false));

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

        {collections.map((collection) => {
          const pins = places.filter((p) => p.collection_id === collection.id);
          const members = membersOf[collection.id] ?? [];
          return (
            <div className="collection-board" id={`collection-${collection.id}`} key={collection.id}>
              <div className="collection-header">
                <div className="collection-title">
                  {collection.emoji} {collection.name}
                  {collection.isPrivate && <Lock className="ico" aria-label="Private" />}
                  {collection.isInbox && <span className="collection-subtext">Shared reels land here</span>}
                </div>
                <div className="collection-count">
                  {members.length > 1 && <><Users className="ico" aria-hidden="true" /> {members.length} · </>}
                  {pins.length} {pins.length === 1 ? 'place' : 'places'}
                </div>
              </div>

              {pins.length === 0 && (
                <button type="button" className="collection-empty" onClick={() => onAddPlace(collection.id)}>
                  No places yet — tap <Plus className="ico" aria-hidden="true" /> to add one.
                </button>
              )}

              <PlaceList
                pins={pins}
                members={members}
                userId={userId}
                onOpen={onOpenPin}
                onReorder={(ids) => onReorder(ids, collection.id)}
                onReordered={markReorderLearned}
              />
            </div>
          );
        })}

        <div className="streak">
          {streak > 0
            ? <><Flame className="ico" aria-hidden="true" /> Streak: {streak} {streak === 1 ? 'adventure' : 'adventures'} this month</>
            : <><Sprout className="ico" aria-hidden="true" /> No adventures yet this month — book one!</>}
        </div>
      </div>
    </div>
  );
}
