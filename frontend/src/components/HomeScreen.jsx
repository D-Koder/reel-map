import React, { useState } from 'react';
import { Flame, GripVertical, Lock, Map as MapIcon, MapPinPlus, Plus, Sprout, Users } from 'lucide-react';
import PlaceList from './PlaceList';
import { readJSON, writeJSON } from '../lib/storage';

// Set after the first reorder, so the hint stops showing on this device.
const REORDER_LEARNED_KEY = 'reelmap:reorder-learned';

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
  onCoverVisible,
  onCoverHidden,
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
                onCoverVisible={onCoverVisible}
                onCoverHidden={onCoverHidden}
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
