// JSON helpers for localStorage. Storage can be full or blocked (private browsing),
// so every call is guarded and the app keeps working without it.
export function readJSON(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved. The app still works; it just won't remember this on the next open.
  }
}

// Removes everything Reel Map saved on this device for one user. Keys end in ":<userId>".
export function clearUserStorage(userId) {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('reelmap:') && key.endsWith(`:${userId}`))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}
