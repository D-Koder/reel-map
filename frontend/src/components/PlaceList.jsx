import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import PlaceRow, { PlaceCard } from './PlaceRow';
import { duplicateIds } from '../lib/places';

// One collection's places. Drag the ⋮⋮ handle to move a card: a single copy follows the finger,
// and the card's spot stays in the list (faded) until it is dropped.
// selecting: Select mode. picked holds the ticked place ids; onToggle ticks one on or off.
export default function PlaceList({ pins, members, userId, onOpen, onReorder, onReordered, selecting = false, picked, onToggle }) {
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
  const duplicates = useMemo(() => duplicateIds(pins), [pins]);
  const activePin = pins.find((p) => p.id === activeId);

  // Rows rise in one after another the first time the list shows. After that, a row that arrives (a partner adds
  // a place, or you do) rises in and flashes. Rows already here stay still.
  const seenRef = useRef(null);
  const isFirst = seenRef.current === null;
  useEffect(() => {
    seenRef.current = new Set(pins.map((p) => p.id));
  }, [pins]);

  // A place that leaves the list (deleted, or moved to another collection) shrinks away instead of vanishing.
  // The row's last height is kept so a copy of it can collapse from that size.
  const listRef = useRef(null);
  const heightsRef = useRef(new Map());
  const prevPinsRef = useRef(pins);
  const [leaving, setLeaving] = useState([]);
  const leaveTimer = useRef(null);
  useLayoutEffect(() => {
    listRef.current?.querySelectorAll('[data-pin-id]').forEach((el) => heightsRef.current.set(el.dataset.pinId, el.offsetHeight));
  });
  useLayoutEffect(() => {
    const now = new Set(pins.map((p) => p.id));
    const gone = prevPinsRef.current
      .map((pin, index) => ({ pin, index, height: heightsRef.current.get(pin.id) }))
      .filter((g) => !now.has(g.pin.id) && g.height);
    prevPinsRef.current = pins;
    if (!gone.length) return;
    setLeaving(gone);
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setLeaving([]), 420);
  }, [pins]);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // The shrinking copy of a place that just left.
  const ghost = (g) => (
    <div key={`leaving-${g.pin.id}`} className="place-row row-leave" aria-hidden="true" style={{ '--leave-h': `${g.height}px` }}>
      <PlaceCard pin={g.pin} members={members} userId={userId} dimmed />
    </div>
  );

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
        <div className="pin-list" ref={listRef}>
          {pins.map((pin, index) => (
            <React.Fragment key={pin.id}>
              {leaving.filter((g) => g.index === index).map(ghost)}
              <PlaceRow
                pin={pin}
                members={members}
                userId={userId}
                enter={isFirst ? { delay: Math.min(index, 8) * 40, fresh: false } : seenRef.current.has(pin.id) ? null : { delay: 0, fresh: true }}
                onOpen={() => onOpen(`${pin.collection_id}:${pin.id}`)}
                duplicate={duplicates.has(pin.id)}
                selectable={selecting}
                selected={selecting && picked?.has(pin.id)}
                onToggle={() => onToggle?.(pin)}
              />
            </React.Fragment>
          ))}
          {leaving.filter((g) => g.index >= pins.length).map(ghost)}
        </div>
      </SortableContext>
      <DragOverlay>
        {activePin && <PlaceCard pin={activePin} members={members} userId={userId} floating />}
      </DragOverlay>
    </DndContext>
  );
}
