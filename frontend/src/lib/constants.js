export const feelings = [
  { id: 'keen', emoji: '🔥', label: 'Keen' },
  { id: 'maybe', emoji: '🤔', label: 'Maybe' },
  { id: 'meh', emoji: '😐', label: 'Meh' },
];

export const feelingEmoji = (id) => feelings.find((f) => f.id === id)?.emoji;

export const categories = [
  { id: 'cafe', icon: '☕', label: '☕ Cafe' },
  { id: 'food', icon: '🍽️', label: '🍽️ Food' },
  { id: 'event', icon: '🎉', label: '🎉 Event' },
];

export const mapFilters = [{ id: 'all', label: 'All' }, ...categories];

export const AVATARS = ['🙂', '😎', '🧑', '👩', '👨', '🦊', '🐼', '🐨', '🌸', '⚡'];
export const DEFAULT_AVATAR_URL = 'https://static.vecteezy.com/system/resources/previews/036/280/650/large_2x/default-avatar-profile-icon-social-media-user-image-gray-avatar-icon-blank-profile-silhouette-illustration-vector.jpg';

export function categoryIcon(categoryId) {
  return categories.find((c) => c.id === categoryId)?.icon ?? '📍';
}

// Card colour + label from the collection members' vibes.
export function getVibe(memberIds, reactions) {
  const votes = memberIds.map((id) => reactions[id]).filter(Boolean);
  const keen = votes.filter((v) => v === 'keen').length;
  const total = memberIds.length;

  if (votes.length === 0) return { consensus: 'no-votes', label: 'No votes yet' };
  if (keen === total) return { consensus: 'both-in', label: 'All in' };
  if (votes.length === total && votes.every((v) => v === 'meh')) {
    return { consensus: 'no-consensus', label: 'Not interested' };
  }
  return { consensus: 'mixed-vibes', label: `${keen} of ${total} keen` };
}

export function formatDateTime(date) {
  return new Date(date).toLocaleDateString('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' });
}

// <input type="datetime-local"> value (local time) for a Date.
export function toLocalInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
