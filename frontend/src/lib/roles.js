// Who can change a collection's places. Viewers (everyone who joins) can see, vote, share and copy;
// the owner and editors can also add, edit, move, delete and book. The database checks this too
// (see 20261018090000_viewer_editor_roles.sql).
export function memberRole(collection, userId) {
  if (!collection) return null;
  if (collection.ownerId === userId) return 'owner';
  return collection.members?.find((m) => m.id === userId)?.role ?? null;
}

export function canEditCollection(collection, userId) {
  const role = memberRole(collection, userId);
  // No role on record (data still loading): don't hide anything, the database has the final say.
  return role === null || role === 'owner' || role === 'editor';
}
