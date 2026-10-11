import React, { useEffect, useRef } from 'react';
import { CalendarDays, CircleCheck, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { feelings, feelingEmoji, formatChipDate, getVibe } from '../lib/constants';
import Avatar from './Avatar';
import PlaceThumb from './PlaceThumb';

// The card itself. Used in the list, and as the floating copy while a card is being moved.
export function PlaceCard({ pin, members, userId, onClick, onKeyDown, onBroken, handleProps = null, handleRef, floating = false, dimmed = false }) {
  const memberIds = [...new Set([...members.map((m) => m.id), userId].filter(Boolean))];
  const vibe = getVibe(memberIds, pin.reactions);
  const votes = memberIds.map((id) => feelingEmoji(pin.reactions[id])).filter(Boolean).join('');
  const isDone = Boolean(pin.booking?.done_at);
  // Shared collections show each person's vote, so you can see who's keen at a glance.
  const shared = members.length > 1;
  const voteSummary = members
    .map((m) => {
      const feeling = feelings.find((f) => f.id === pin.reactions[m.id]);
      return `${m.id === userId ? 'You' : m.display_name}: ${feeling?.label ?? 'no vote yet'}`;
    })
    .join(', ');

  return (
    // Tap the card to open it. Drag the handle on the right to move it.
    <div
      className={`pin-item ${vibe.consensus} ${isDone ? 'done' : ''} ${floating ? 'floating' : ''} ${dimmed ? 'dimmed' : ''}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      // Stops the browser's drag preview from appearing over the card.
      onDragStart={(e) => e.preventDefault()}
    >
        <button
          type="button"
          className="place-thumb-link"
          aria-label={pin.reel_url ? `Open ${pin.name} reel` : `${pin.name} thumbnail`}
          disabled={!pin.reel_url}
          onClick={(event) => {
            event.stopPropagation();
            if (pin.reel_url) window.open(pin.reel_url, '_blank', 'noopener,noreferrer');
          }}
        >
          <PlaceThumb place={pin} className="pin-thumbnail" onBroken={onBroken} />
        </button>
        <div className="pin-info">
          <div className="pin-name">{pin.name}</div>
          {pin.custom_info && <div className="pin-custom-info">{pin.custom_info}</div>}
          {isDone ? (
            <div className="pin-rating pin-done"><CircleCheck aria-hidden="true" /> Done</div>
          ) : shared ? (
            <div className="pin-votes" aria-label={`${vibe.label}. ${voteSummary}`}>
              <span className="vote-chips" aria-hidden="true">
                {members.map((m) => (
                  <span key={m.id} className={`vote-chip ${pin.reactions[m.id] ? '' : 'no-vote'}`}>
                    <Avatar person={m} className="vote-avatar" />
                    <span className="vote-emoji">{feelingEmoji(pin.reactions[m.id]) ?? '?'}</span>
                  </span>
                ))}
              </span>
              <span className="pin-rating" aria-hidden="true">{vibe.label}</span>
              {!pin.reactions[userId] && <span className="vote-nudge" aria-hidden="true">Your vote?</span>}
            </div>
          ) : (
            <div className="pin-rating">{`${votes} ${vibe.label}`.trim()}</div>
          )}
          {pin.booking && !isDone && (
            <span className="date-chip" title="Booked">
              <CalendarDays aria-hidden="true" />
              <span className="sr-only">Booked for </span>
              {formatChipDate(pin.booking.planned_at)}
            </span>
          )}
        </div>
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

export default function PlaceRow({ pin, members, userId, onOpen, onVisible, onHidden }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  });
  // Tell the app when this card is on screen (or about to be), so its cover can be refreshed.
  // The latest callbacks are read through refs, so the observer doesn't have to be rebuilt on every render.
  const rowRef = useRef(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const callbacks = useRef({ onVisible, onHidden });
  callbacks.current = { onVisible, onHidden };
  useEffect(() => {
    const node = rowRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) callbacks.current.onVisible?.(pinRef.current);
        else callbacks.current.onHidden?.(pinRef.current);
      },
      // Start a little before the card reaches the screen, so the cover is ready when it arrives.
      { rootMargin: '300px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // A short buzz when the card is picked up.
  useEffect(() => {
    if (isDragging) navigator.vibrate?.(10);
  }, [isDragging]);
  const open = () => {
    if (!isDragging) onOpen();
  };

  return (
    <div
      ref={(node) => {
        rowRef.current = node;
        setNodeRef(node);
      }}
      className="place-row"
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <PlaceCard
        pin={pin}
        members={members}
        userId={userId}
        dimmed={isDragging}
        handleRef={setActivatorNodeRef}
        handleProps={{ ...attributes, ...listeners }}
        onClick={open}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e);
          if (e.key === 'Enter') open();
        }}
        onBroken={() => onVisible?.(pin, true)}
      />
    </div>
  );
}
