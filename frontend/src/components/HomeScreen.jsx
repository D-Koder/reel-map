import React, { useState } from 'react';
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
            <div className="empty-emoji">🗺️</div>
            <h2>Start your first list</h2>
            <p>Collections hold the places you find in reels — date nights, brunch spots, gigs.</p>
            <button className="step-btn primary full-width" onClick={onOpenSettings}>
              ＋ Create a collection
            </button>
            <button className="step-btn secondary full-width" onClick={onCreateSample}>
              ✨ Add sample places to try it out
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
          <div className="reorder-hint">Tip: press and hold a place to move it</div>
        )}

        {collections.map((collection) => {
          const pins = places.filter((p) => p.collection_id === collection.id);
          const members = membersOf[collection.id] ?? [];
          return (
            <div className="collection-board" key={collection.id}>
              <div className="collection-header">
                <div className="collection-title">
                  {collection.emoji} {collection.name}
                  {collection.isPrivate && <span title="Private">🔒</span>}
                </div>
                <div className="collection-count">
                  {members.length > 1 && `👥 ${members.length} · `}
                  {pins.length} {pins.length === 1 ? 'place' : 'places'}
                </div>
              </div>

              {pins.length === 0 && (
                <button type="button" className="collection-empty" onClick={() => onAddPlace(collection.id)}>
                  No places yet — tap ＋ to add one.
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
            ? `🔥 Streak: ${streak} ${streak === 1 ? 'adventure' : 'adventures'} this month`
            : '🌱 No adventures yet this month — book one!'}
        </div>
      </div>
    </div>
  );
}
