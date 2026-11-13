// Which tour a new account gets, and what to do first. Kept apart from the screen so it can be tested.
//   handoff: what the no-login demo left behind (or null)
//   returns { variant, collName, create, clear }
//     create: make the collection the demo chose (it does not exist yet and is not being made)
//     clear: the demo's hand-off has been used (or is not for this account) and can go
export function startPlan({ joinedByInvite, handoff, collections, userId, creating = false }) {
  if (joinedByInvite) return { variant: 'partner', collName: null, create: false, clear: Boolean(handoff) };
  if (!handoff) return { variant: 'main', collName: null, create: false, clear: false };
  const exists = collections.some((c) => c.name === handoff.collName && c.ownerId === userId);
  return { variant: 'demo', collName: handoff.collName, create: !exists && !creating, clear: exists };
}
