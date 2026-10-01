import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { feelingEmoji, getVibe } from '../lib/constants';
import PlaceThumb from './PlaceThumb';

export default function PlaceRow({ pin, members, onOpen }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  });
  const memberIds = members.map((m) => m.id);
  const vibe = getVibe(memberIds, pin.reactions);
  const votes = memberIds.map((id) => feelingEmoji(pin.reactions[id])).filter(Boolean).join('');
  const isDone = Boolean(pin.visit);

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
        <PlaceThumb place={pin} className="pin-thumbnail" />
        <div className="pin-info">
          <div className="pin-name">{pin.name}</div>
          <div className="pin-rating">{isDone ? '✅ Done' : `${votes} ${vibe.label}`.trim()}</div>
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
