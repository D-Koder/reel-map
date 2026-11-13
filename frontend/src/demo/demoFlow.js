// What the no-login demo says and does, as plain data and functions, so it can be tested without a screen.
// The screens (Demo.jsx) only draw this state and send actions to the reducer. Nothing here calls a server.

export const PLANS = [
  { emoji: '🍷', name: 'Date night' },
  { emoji: '🧳', name: 'Weekend away' },
  { emoji: '🍜', name: 'Food crawl' },
  { emoji: '🎉', name: 'Friends hangout' },
];
// The Save button on the real inbox card: the tap hint sits on it.
export const SAVE_BUTTON = '[data-tour="confirm"] .inbox-action:not(.secondary)';
export const SAMPLE = { name: 'Sample Noodle Bar', address: '1 Example St, Melbourne VIC 3000' };

export function initialState() {
  return {
    step: 'welcome', // welcome, planq, paste, saved, book, done
    collName: '',
    collEmoji: '📌',
    paste: 'idle', // idle, finding, confirm
    verifying: false, // "Verify place" was tapped
    saved: false,
    placeOpen: false,
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
    case 'found': return s.paste === 'finding' ? { ...s, paste: 'confirm' } : s;
    case 'verify': return { ...s, verifying: true };
    case 'save': return s.paste === 'confirm' ? { ...s, paste: 'idle', verifying: false, saved: true, step: 'saved' } : s;
    case 'saved-done': return { ...s, step: 'book' };
    case 'open': return { ...s, placeOpen: true };
    case 'close': return { ...s, placeOpen: false };
    case 'booked': return { ...s, booked: a.iso };
    case 'booked-next': return { ...s, step: 'done', placeOpen: false };
    case 'back': return s.placeOpen && !s.booked ? { ...s, placeOpen: false } : s;
    case 'ask-skip': return { ...s, confirmSkip: true };
    case 'keep': return { ...s, confirmSkip: false };
    case 'skip': return { ...s, confirmSkip: false, step: 'done', placeOpen: false, paste: 'idle' };
    case 'restart': return initialState();
    default: return s;
  }
}

// How long a tip stays up before the demo moves on by itself: at least a second and a half, a little longer for more words.
export const canGoBack = (s) => s.step === 'book' && !s.booked && s.placeOpen;

export const tipMs = (title, body) => Math.min(3000, 1500 + (title.length + body.length) * 15);

// What the person did, said as plainly as possible. Never claims more than they did.
export function doneSummary(s) {
  const did = [s.saved && 'saved a reel', s.booked && 'booked a time'].filter(Boolean);
  if (!s.booked) {
    return { title: 'Ready when you are', body: did.length ? `You ${did.join(' and ')}. Save your own reels and plan with a partner.` : 'Save your own reels and plan with a partner.' };
  }
  return { title: 'You planned your first date! 🎉', body: `You ${did.join(' and ')} faster than I could say Waylit Maps. Make it yours and plan with a partner.` };
}

// The words, the pose and what to point at for the current moment.
//   dom: what the real place sheet is showing right now, read from the screen: { wizard: 'time' | 'confirm' | 'booked' | null, timePicked }
//   target: a CSS selector for the element to spotlight, or null
//   auto: { ms, action }  the demo moves on by itself after ms
//   next: a Next button is shown, with this action
export function describeDemo(s, dom = {}) {
  const tip = (title, body, pose, extra = {}) => ({ title, body, pose, target: null, center: false, ...extra });
  let d;
  if (s.step === 'welcome') d = tip('Try Waylit. No account needed.', 'Turn a reel into a plan in a few taps.', 'hello', { center: true });
  else if (s.step === 'planq') d = tip('What are you planning?', 'Pick one to start your first collection.', 'thinking', { center: true });
  else if (s.step === 'paste') {
    if (s.paste === 'finding') d = tip('Finding your spot…', 'Just a moment.', 'looking', { target: '.inbox-card' });
    else if (s.paste === 'confirm') {
      d = s.verifying
        ? tip('Verify place', 'In your account this lets you pick a different place. For now, tap Save.', 'pointing', { target: '[data-tour="confirm"]', hint: true, hintTarget: SAVE_BUTTON })
        : tip('Is this the spot?', "Check it's right, then tap Save. Not quite right? Tap Verify place to pick the right one.", 'pointing', { target: '[data-tour="confirm"]', hint: true, hintTarget: SAVE_BUTTON });
    } else d = tip('Got a reel?', 'Copy the link, then tap Paste.', 'pointing', { target: '[data-tour="paste"]', hint: true });
  } else if (s.step === 'saved') d = tip('Saved! 🎉', 'Your first place is in.', 'celebrate');
  else if (s.step === 'book') {
    if (s.booked) d = tip('Booked! 🎉', 'Your group gets a ping. Tap Done to finish.', 'celebrate', { next: 'booked-next', target: '.checklist-step' });
    else if (!s.placeOpen) d = tip("Let's book it", 'Tap your place.', 'pointing', { target: '[data-tour="place"]', hint: true });
    else if (dom.wizard === 'confirm') d = tip('Set the time you got', 'Change it to the time you booked, then tap Confirm.', 'pointing', { target: '.checklist-step .step-btn.primary', hint: true });
    else if (dom.timePicked) d = tip('Nice', 'Tap Continue.', 'pointing', { target: '.time-picker .step-btn.primary', hint: true });
    else d = tip('Find a time', "Pick a day and a time. In your account you'd then tap Call or Website to reserve.", 'thinking', { target: '[data-tour="plan"]' });
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

