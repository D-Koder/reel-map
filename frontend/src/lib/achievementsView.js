// Small decisions the Achievements screen makes, as plain functions so they can be tested.

// Badges worth chasing next: not coming soon, not earned yet, ordered by how much of the goal is done.
export function nextUpBadges(badges, limit = 3) {
  return badges
    .filter((b) => b.st === 'todo')
    .sort((a, b) => b.count / b.target - a.count / a.target)
    .slice(0, limit);
}

// Which tab the screen opens on: rewards waiting first, then the starter quests, then badges.
export function defaultTab({ ready, questsComplete }) {
  if (ready > 0) return 'rewards';
  return questsComplete ? 'badges' : 'quests';
}

// The reward the gold strip points at: a badge first, then the lowest level prize.
export function firstReady({ readyBadges, readyPrizes }) {
  if (readyBadges.length) return { kind: 'badge', id: readyBadges[0].id, tab: 'badges' };
  if (readyPrizes.length) return { kind: 'prize', id: readyPrizes[0].level, tab: 'rewards' };
  return null;
}
