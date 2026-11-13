// A tiny message line between the app's screens and the tour, so the Share screen and Settings can tell the tour
// something happened ("invite-sent", "replay") without being wired through every parent.
const listeners = new Set();

export function onTour(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTour(type, detail) {
  listeners.forEach((listener) => listener(type, detail));
}
