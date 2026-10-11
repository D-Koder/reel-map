import React, { useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import PlaceRow, { PlaceCard } from './PlaceRow';

// One collection's places. Drag the ⋮⋮ handle to move a card: a single copy follows the finger,
// and the card's spot stays in the list (faded) until it is dropped.
export default function PlaceList({ pins, members, userId, onOpen, onReorder, onReordered, onCoverVisible, onCoverHidden }) {
  const sensors = useSensors(
    // A few pixels of movement starts a drag, so a slightly shaky tap on the handle still counts.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter opens the place, so only Space picks it up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    })
  );
  const [activeId, setActiveId] = useState(null);
  const activePin = pins.find((p) => p.id === activeId);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    onReordered?.();
    const ids = pins.map((p) => p.id);
    onReorder(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Only up and down, and never outside this collection's list.
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={pins.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="pin-list">
          {pins.map((pin) => (
            <PlaceRow
              key={pin.id}
              pin={pin}
              members={members}
              userId={userId}
              onOpen={() => onOpen(`${pin.collection_id}:${pin.id}`)}
              onVisible={onCoverVisible}
              onHidden={onCoverHidden}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activePin && <PlaceCard pin={activePin} members={members} userId={userId} floating />}
      </DragOverlay>
    </DndContext>
  );
}
