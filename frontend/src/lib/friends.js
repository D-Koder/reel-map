// Friends: the small pure rules (who can be suggested, who can be added, what a friend link looks like).
// The screens and the database calls live in hooks/useFriends.js and components/FriendsSection.jsx.

// The code in a friend link (…?friend=<code>), else null.
export function friendCodeFromSearch(search) {
  const code = new URLSearchParams(search).get('friend');
  return code && /^[a-z0-9]{8,32}$/i.test(code) ? code.toLowerCase() : null;
}

export const friendLink = (origin, code) => `${origin}?friend=${code}`;

// A friend link opened before the person has an account is kept until they are in, because the email
// confirmation link brings them back to the home page without it.
const KEY = 'waylit:pending-friend';
export function rememberFriendCode(code, store = globalThis.localStorage) {
  try { store.setItem(KEY, code); } catch { /* private mode */ }
}
export function pendingFriendCode(store = globalThis.localStorage) {
  try { return store.getItem(KEY); } catch { return null; }
}
export function forgetFriendCode(store = globalThis.localStorage) {
  try { store.removeItem(KEY); } catch { /* private mode */ }
}

// People in my collections I haven't connected with yet (no friend, no open request), by name.
// related: the ids of everyone I already have a friendship row with, either way round.
export function peopleYouKnow(collections, userId, related) {
  const known = new Set(related);
  const seen = new Map();
  for (const collection of collections ?? []) {
    for (const member of collection.members ?? []) {
      if (member.id === userId || known.has(member.id) || seen.has(member.id)) continue;
      seen.set(member.id, member);
    }
  }
  return [...seen.values()].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
}

// Friends who are not in this collection yet.
export function addableFriends(friends, collection) {
  const inside = new Set((collection?.members ?? []).map((m) => m.id));
  return (friends ?? []).filter((f) => f.direction === 'friend' && !inside.has(f.id));
}
