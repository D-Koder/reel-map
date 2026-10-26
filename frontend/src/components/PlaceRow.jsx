import React, { useEffect } from 'react';
import { Check, CircleCheck, GripVertical, MapPin } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { feelings, feelingEmoji, formatChipDate, getVibe } from '../lib/constants';
import Avatar from './Avatar';
import PlaceThumb from './PlaceThumb';
import ReelEmbedThumb, { reelEmbed } from './ReelEmbedThumb';

// "16 Timothy Ln, Melbourne VIC 3000, Australia" -> "16 Timothy Ln, Melbourne": street and suburb only.
function shortAddress(address) {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const suburb = parts[1]?.replace(/\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b.*$/, '').trim();
  return suburb && suburb !== parts[0] ? `${parts[0]}, ${suburb}` : parts[0] ?? '';
}

const VOTE_ORDER = { keen: 0, maybe: 1, meh: 2 };
const MAX_FACES = 3;

// One line of votes: up to three faces (you first, then keen, maybe, meh), a +N bubble, the count,
// and a nudge. The nudge never shrinks, so "Your vote?" always shows in full.
function VoteLine({ members, reactions, userId }) {
  const me = members.find((m) => m.id === userId);
  const others = members
    .filter((m) => m.id !== userId)
    .sort((a, b) => (VOTE_ORDER[reactions[a.id]] ?? 3) - (VOTE_ORDER[reactions[b.id]] ?? 3));
  const faces = [me, ...others].filter(Boolean);
  const shown = faces.slice(0, MAX_FACES);
  const extra = faces.length - shown.length;

  const votes = members.map((m) => reactions[m.id]).filter(Boolean);
  const keen = votes.filter((v) => v === 'keen').length;
  const myVote = reactions[userId];
  const waiting = members.length - votes.length;

  let count = null;
  let nudge = null;
  if (votes.length === members.length && keen === members.length) {
    nudge = <b className="all-keen">{members.length === 2 ? 'Both keen' : `All ${members.length} keen`}</b>;
  } else {
    count = votes.length ? `${keen}/${votes.length} keen` : 'No votes';
    if (!myVote) nudge = <b className="vote-nudge">Your vote?</b>;
    else if (waiting > 0) nudge = <span className="vote-waiting">{waiting} to go</span>;
  }

  return (
    <div className="vote-line" aria-hidden="true">
      <span className="face-stack">
        {shown.map((person) => {
          const mine = person.id === userId;
          const pending = mine && !myVote;
          return (
            <span key={person.id} className={`face ${mine ? 'me' : ''} ${pending ? 'pending' : ''}`}>
              <Avatar person={person} className="face-avatar" />
              {mine && <span className="face-badge">{pending ? '?' : feelingEmoji(myVote)}</span>}
            </span>
          );
        })}
        {extra > 0 && <span className="face more">+{extra}</span>}
      </span>
      <span className="vote-status">
        {count && <span className="vote-count">{count}{nudge ? ' ·' : ''}</span>}
        {nudge}
      </span>
    </div>
  );
}

// The card itself. Used in the list, and as the floating copy while a card is being moved.
// Four short lines beside the photo: name, place, info (cut with "…"), votes.
// selectable: Select mode. The whole card ticks on and off, and the reel can't be tapped.
export function PlaceCard({ pin, members, userId, onClick, onKeyDown, handleProps = null, handleRef, floating = false, dimmed = false, selectable = false, selected = false, duplicate = false }) {
  const memberIds = [...new Set([...members.map((m) => m.id), userId].filter(Boolean))];
  const vibe = getVibe(memberIds, pin.reactions);
  const isDone = Boolean(pin.booking?.done_at);
  // Shared collections show each person's vote, so you can see who's keen at a glance.
  const shared = members.length > 1;
  const myFeeling = feelings.find((f) => f.id === pin.reactions[userId]);
  const where = shortAddress(pin.address);
  const people = memberIds.map((id) => members.find((m) => m.id === id) ?? { id, display_name: 'You' });
  const voteSummary = members
    .map((m) => {
      const feeling = feelings.find((f) => f.id === pin.reactions[m.id]);
      return `${m.id === userId ? 'You' : m.display_name}: ${feeling?.label ?? 'no vote yet'}`;
    })
    .join(', ');

  return (
    // Tap the card to open it. Drag the handle on the right to move it.
    <div
      className={`pin-item ${vibe.consensus} ${isDone ? 'done' : ''} ${floating ? 'floating' : ''} ${dimmed ? 'dimmed' : ''} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...(selectable ? { role: 'checkbox', 'aria-checked': selected, 'aria-label': pin.name, tabIndex: 0 } : {})}
      // Stops the browser's drag preview from appearing over the card.
      onDragStart={(e) => e.preventDefault()}
    >
        <button
          type="button"
          className="place-thumb-link"
          aria-label={pin.reel_url ? `Open ${pin.name} reel` : `${pin.name} thumbnail`}
          disabled={!pin.reel_url || selectable}
          tabIndex={selectable ? -1 : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (pin.reel_url) window.open(pin.reel_url, '_blank', 'noopener,noreferrer');
          }}
        >
          {/* Instagram and TikTok reels show the platform's own embed, shrunk to fit; anything else shows the saved cover. */}
          {reelEmbed(pin.reel_url)
            ? <ReelEmbedThumb reelUrl={pin.reel_url} mapsUrl={pin.maps_url} className="pin-thumbnail" />
            : <PlaceThumb place={pin} className="pin-thumbnail" />}
          {/* The planned date hangs off the photo on a solid tab, so it never blends into the picture. */}
          {pin.booking && !isDone && (
            <span className="date-tab">
              <span className="sr-only">Planned for </span>
              {formatChipDate(pin.booking.planned_at)}
            </span>
          )}
        </button>
        <div className="pin-info">
          <div className="pin-name">{pin.emoji && <span aria-hidden="true">{pin.emoji} </span>}{pin.name}</div>
          {where && (
            <div className="pin-where">
              <MapPin aria-hidden="true" />
              <span>{where}</span>
            </div>
          )}
          {pin.custom_info && <div className="pin-custom-info" title={pin.custom_info}>{pin.custom_info}</div>}
          {isDone ? (
            <div className="pin-rating pin-done"><CircleCheck aria-hidden="true" /> Done</div>
          ) : shared ? (
            <>
              <span className="sr-only">{`${vibe.label}. ${voteSummary}`}</span>
              <VoteLine members={people} reactions={pin.reactions} userId={userId} />
            </>
          ) : (
            <div className="pin-rating">{myFeeling ? `${myFeeling.emoji} ${myFeeling.label}` : 'Tap to vote'}</div>
          )}
        </div>
      {/* Saved twice in this collection. Hidden while selecting, where the tick sits in this corner. */}
      {duplicate && !selectable && <span className="duplicate-pill" title="Saved more than once in this collection">Duplicate</span>}
      {selectable && (
        <span className="select-tick" aria-hidden="true">{selected && <Check />}</span>
      )}
      {handleProps && (
        <button
          type="button"
          ref={handleRef}
          className="drag-handle"
          aria-label={`Move ${pin.name}`}
          onClick={(e) => e.stopPropagation()}
          {...handleProps}
        >
          <GripVertical aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function PlaceRow({ pin, members, userId, onOpen, selectable = false, selected = false, onToggle, duplicate = false }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
    // No dragging while selecting: a tap ticks the card instead.
    disabled: selectable,
  });
  // A short buzz when the card is picked up.
  useEffect(() => {
    if (isDragging) navigator.vibrate?.(10);
  }, [isDragging]);
  const open = () => {
    if (!isDragging) onOpen();
  };

  return (
    <div
      ref={setNodeRef}
      className="place-row"
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {selectable ? (
        <PlaceCard
          pin={pin}
          members={members}
          userId={userId}
          selectable
          selected={selected}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
        />
      ) : (
        <PlaceCard
          pin={pin}
          members={members}
          userId={userId}
          duplicate={duplicate}
          dimmed={isDragging}
          handleRef={setActivatorNodeRef}
          handleProps={{ ...attributes, ...listeners }}
          onClick={open}
          onKeyDown={(e) => {
            listeners?.onKeyDown?.(e);
            if (e.key === 'Enter') open();
          }}
        />
      )}
    </div>
  );
}
