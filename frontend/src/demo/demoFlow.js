// What the no-login demo says and does, as plain data and functions, so it can be tested without a screen.
// The screens (Demo.jsx) only draw this state and send actions to the reducer. Nothing here calls a server.

export const PLANS = [
  { emoji: '🍷', name: 'Date night' },
  { emoji: '🧳', name: 'Weekend away' },
  { emoji: '🍜', name: 'Food crawl' },
  { emoji: '🎉', name: 'Friends hangout' },
];
export const SAMPLE = { name: 'Sample Noodle Bar', address: '1 Example St, Melbourne VIC' };

export function initialState() {
  return {
    step: 'welcome', // welcome, planq, paste, saved, book, done
    collName: '',
    collEmoji: '📌',
    paste: 'idle', // idle, finding
    saved: false,
    placeOpen: false,
    bstep: 0, // 0 = the Find a time button, 1 = pick a time, 2 = did you book it
    picked: null, // an ISO time
    booked: null, // an ISO time
    confirmSkip: false,
  };
}

// "Fri 7:00 pm"
export function timeLabel(date) {
  const day = date.toLocaleDateString(undefined, { weekday: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${day} ${time}`;
}

// Three times to choose from: the next Friday 7pm, Saturday 12:30pm and Saturday 7pm that are still ahead.
export function suggestedTimes(now = new Date()) {
  return [[5, 19, 0], [6, 12, 30], [6, 19, 0]]
    .map(([weekday, hour, minute]) => {
      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);
      date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
      if (date <= now) date.setDate(date.getDate() + 7);
      return date;
    })
    .sort((a, b) => a - b)
    .map((date) => ({ iso: date.toISOString(), label: timeLabel(date) }));
}

export function demoReducer(s, a) {
  switch (a.type) {
    case 'start': return { ...s, step: 'planq' };
    case 'plan': return { ...s, step: 'paste', collName: a.name, collEmoji: a.emoji };
    case 'paste': return { ...s, paste: 'finding' };
    case 'found': return { ...s, paste: 'idle', saved: true, step: 'saved' };
    case 'saved-done': return { ...s, step: 'book' };
    case 'open': return { ...s, placeOpen: true };
    case 'close': return { ...s, placeOpen: false, bstep: 0, picked: null };
    case 'wizard': return { ...s, bstep: 1 };
    case 'pick': return { ...s, picked: a.iso };
    case 'continue': return s.picked ? { ...s, bstep: 2 } : s;
    case 'confirm': return s.picked ? { ...s, booked: s.picked, bstep: 0 } : s;
    case 'booked-next': return { ...s, step: 'done', placeOpen: false };
    case 'back':
      if (s.bstep === 2) return { ...s, bstep: 1 };
      if (s.bstep === 1) return { ...s, bstep: 0, picked: null };
      if (s.placeOpen && !s.booked) return { ...s, placeOpen: false };
      return s;
    case 'ask-skip': return { ...s, confirmSkip: true };
    case 'keep': return { ...s, confirmSkip: false };
    case 'skip': return { ...s, confirmSkip: false, step: 'done', placeOpen: false, paste: 'idle' };
    case 'restart': return initialState();
    default: return s;
  }
}

export const canGoBack = (s) => s.step === 'book' && !s.booked && (s.placeOpen || s.bstep > 0);

// How long a tip stays up before the demo moves on by itself: at least a second and a half, a little longer for more words.
export const tipMs = (title, body) => Math.min(3000, 1500 + (title.length + body.length) * 15);

// What the person did, said as plainly as possible. Never claims more than they did.
export function doneSummary(s) {
  const did = [s.saved && 'saved a reel', s.booked && 'booked a time'].filter(Boolean);
  if (!s.booked) {
    return { title: 'Ready when you are', body: did.length ? `You ${did.join(' and ')}. Save your own reels and plan with a partner.` : 'Save your own reels and plan with a partner.' };
  }
  return { title: 'You planned your first date! 🎉', body: `You ${did.join(' and ')}. Make it yours and plan with a partner.` };
}

// The words, the pose and what to point at for the current moment.
//   target: which element to spotlight (matched to data-demo-t on the screen), or null
//   auto: { ms, action }  the demo moves on by itself after ms
//   next: a Next button is shown, with this action
export function describeDemo(s) {
  const tip = (title, body, pose, extra = {}) => ({ title, body, pose, target: null, center: false, ...extra });
  let d;
  if (s.step === 'welcome') d = tip('Try Waylit. No account needed.', 'Turn a reel into a plan in a few taps.', 'hello', { center: true });
  else if (s.step === 'planq') d = tip('What are you planning?', 'Pick one to start your first collection.', 'thinking', { center: true });
  else if (s.step === 'paste') {
    d = s.paste === 'finding'
      ? tip('Finding your spot…', 'Just a moment.', 'looking', { target: 'finding' })
      : tip('Got a reel?', 'Copy the link, then tap Paste.', 'pointing', { target: 'paste' });
  } else if (s.step === 'saved') d = tip('Saved! 🎉', 'Your first place is in.', 'celebrate');
  else if (s.step === 'book') {
    if (s.booked) d = tip('Booked! 🎉', 'Your group gets a ping.', 'celebrate', { next: 'booked-next' });
    else if (!s.placeOpen) d = tip("Let's book it", 'Tap your place.', 'pointing', { target: 'place' });
    else if (s.bstep === 0) d = tip('Find a time', 'Pick a time, then book with the venue.', 'pointing', { target: 'plan' });
    else if (s.bstep === 1) d = s.picked ? tip('Nice', 'Tap Continue.', 'pointing', { target: 'continue' }) : tip('Pick a time', 'Any time works here.', 'thinking', { target: 'times' });
    else d = tip('Did you get it?', 'Tap Confirm to say you booked.', 'pointing', { target: 'confirm' });
  } else {
    const { title, body } = doneSummary(s);
    d = tip(title, body, 'celebrate', { center: true });
  }
  if (s.paste === 'finding' && s.step === 'paste') d.auto = { ms: tipMs(d.title, d.body) + 1200, action: 'found' };
  if (s.step === 'saved') d.auto = { ms: tipMs(d.title, d.body), action: 'saved-done' };
  return d;
}

// What gets remembered for the account the person makes next.
export const handoffFrom = (s) => ({ collName: s.collName, collEmoji: s.collEmoji, saved: s.saved, booked: Boolean(s.booked) });
