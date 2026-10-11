import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { feelings, feelingEmoji, getVibe } from '../lib/constants';
import Avatar from './Avatar';
import PlaceThumb from './PlaceThumb';

export default function PlaceRow({ pin, members, userId, onOpen }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  });
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
    <div
      ref={setNodeRef}
      className={`place-row ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div
        className={`pin-item ${vibe.consensus} ${isDone ? 'done' : ''}`}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}
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
          <PlaceThumb place={pin} className="pin-thumbnail" />
        </button>
        <div className="pin-info">
          <div className="pin-name">{pin.name}</div>
          {pin.custom_info && <div className="pin-custom-info">{pin.custom_info}</div>}
          {isDone ? (
            <div className="pin-rating">✅ Done</div>
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
        </div>
        {pin.booking && !isDone && (
          <div className="pin-booked-badge" title="Booked">
            🟢
          </div>
        )}
        <button
          ref={setActivatorNodeRef}
          className="drag-handle"
          aria-label={`Reorder ${pin.name}`}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      </div>
    </div>
  );
}
