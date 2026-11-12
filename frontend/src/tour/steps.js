// What the first-run tour says and points at. Nothing here touches the screen: every step is described from a
// plain `ctx` object (the app's current state), so it can be tested on its own.
//
// ctx: { pushState ('granted' | 'default' | 'denied' | 'unsupported'), shareCollectionId, variant, name, isWide, isIos, standalone, place, placeKey, hasVotablePlace, votablePlace, userId,
//        collections, collName, startCollections, placeCollectionAtStart, openPinId, editPinId, settingsOpen, shareOpen,
//        notificationsOpen, screen, inboxItems, inviteSent, has(selector) }

// A sample place made for the tour carries this note, so it can always be found and removed again.
export const TOUR_MARK = 'Sample for the tour. It is removed when the tour ends.';
export const SAMPLE_PREFIX = 'tour-sample:';
export const SAMPLE_DETAILS = {
  name: 'Sample Noodle Bar',
  address: '1 Example St, Melbourne VIC 3000',
  latitude: -37.81837,
  longitude: 144.96719,
  // Built in, so the tour never asks Google or the AI for hours.
  hours: [
    { days: 'Monday', time: '11:30 AM – 3:00 PM, 5:00 – 10:00 PM' },
    { days: 'Tuesday', time: '11:30 AM – 3:00 PM, 5:00 – 10:00 PM' },
    { days: 'Wednesday', time: '11:30 AM – 3:00 PM, 5:00 – 10:00 PM' },
    { days: 'Thursday', time: '11:30 AM – 3:00 PM, 5:00 – 10:00 PM' },
    { days: 'Friday', time: '11:30 AM – 3:00 PM, 5:00 – 11:00 PM' },
    { days: 'Saturday', time: '11:30 AM – 11:00 PM' },
    { days: 'Sunday', time: '11:30 AM – 10:00 PM' },
  ],
};

const placeAnchor = (key) => `[data-tour="place"][data-tour-for="${key}"]`;

// The steps for one run of the tour, in order, left out when they don't apply to this phone or screen.
export function stepsFor(variant, ctx) {
  // Someone who tried the no-login demo already knows how to save and book, so only the rest is shown.
  if (variant === 'demo') {
    return ['welcome', 'share', ...(ctx.isIos && !ctx.standalone ? ['install'] : []), 'notify', 'done'];
  }
  if (variant === 'partner') {
    return [
      'welcome',
      ...(ctx.hasVotablePlace ? ['vote'] : []),
      'notes',
      ...(ctx.isIos && !ctx.standalone ? ['install'] : []),
      'notify',
      'done',
    ];
  }
  return [
    'welcome', 'paste', 'confirm', 'keen', 'book',
    ...(ctx.isWide ? [] : ['map']),
    'coll', 'share', 'notes',
    ...(ctx.isIos && !ctx.standalone ? ['install'] : []),
    'notify', 'done',
  ];
}

// Steps that point at the person's place, so they are passed over when there isn't one (the earlier steps were skipped).
export const needsPlace = (id) => ['keen', 'book', 'coll'].includes(id);

// Steps with a progress dot. The welcome, the finish and the install tip sit outside the count.
export const hasDot = (id) => !['welcome', 'done', 'install'].includes(id);

export const isOpen = (ctx, openId) => Boolean(openId) && (openId === ctx.placeKey || openId === ctx.place?.id);

export function describe(id, ctx) {
  const { place, placeKey } = ctx;
  const nm = ctx.name ? `, ${ctx.name}` : '';
  switch (id) {
    case 'welcome':
      if (ctx.variant === 'demo') {
        return { title: `Welcome${nm}!`, body: `Your ${ctx.collName || 'new'} collection is ready. You already know how to save and book, so there are just two things left to show you. You can skip any time.` };
      }
      return ctx.variant === 'partner'
        ? { title: `Welcome${nm}!`, body: "You've joined a shared collection. Here's a quick look at how to vote, stay in the loop and plan together. You can skip any time." }
        : { title: `Hey${ctx.name ? ` ${ctx.name}` : ''}, welcome to Waylit!`, body: "Let's turn a reel into a plan. A few quick steps, and you can skip any time." };

    case 'paste':
      return {
        title: 'Save a reel',
        body: 'Copied a reel link? Tap Paste a reel link. You can also share from Instagram, use the iPhone Shortcut, or add one by hand with the + button.',
        hint: 'Tap the highlighted button, or try a sample place.',
        anchor: '[data-tour="paste"]',
        done: ctx.inboxItems.length > 0 || Boolean(place),
        extra: ctx.inboxItems.length === 0 && !place ? { label: 'Try a sample place', action: 'sample' } : null,
      };

    case 'confirm': {
      if (ctx.has('[data-tour="confirm"]')) {
        return { title: 'Is this the spot?', body: "We found a place. Check it's right, then tap Save. Wrong one? Tap Wrong place to pick another.", hint: 'Tap Save.', anchor: '[data-tour="confirm"]', done: Boolean(place) };
      }
      if (!place && ctx.inboxItems.some((i) => i.status === 'needs-place')) {
        return { title: 'Pick the right place', body: 'Choose the correct place from the list, then save it. The tour carries on from there.', done: false };
      }
      return {
        title: place ? 'Saved!' : 'Finding your place…',
        body: place ? 'Nice. It is in your collection.' : 'This takes a few seconds. Then we will ask you to check it.',
        done: Boolean(place),
        fallbackTo: !place && ctx.inboxItems.length === 0 ? 'paste' : null,
      };
    }

    case 'keen':
      return {
        title: "You're marked Keen 🔥",
        body: "Saving a reel means you're keen, so we set that for you. Changed your mind? Open the place and tap Maybe or Meh.",
        anchor: place ? placeAnchor(placeKey) : null,
        needsNext: true,
      };

    case 'book': {
      if (place?.booking) {
        return { title: 'Booked!', body: "In your real account, the collection gets a notification, shown in each person's own time zone. This sample booking stays on your phone and nothing is sent.", needsNext: true };
      }
      if (isOpen(ctx, ctx.openPinId)) {
        return { title: 'Find a time & book', body: "Choose a time to try, then book with the venue yourself. We can't see the venue's tables. Come back and confirm what you got.", hint: 'Follow the highlighted steps.', anchor: '[data-tour="plan"]' };
      }
      return { title: 'Book it', body: 'Ready to go? Tap your place to open it.', hint: 'Tap your place.', anchor: place ? placeAnchor(placeKey) : null };
    }

    case 'map':
      return ctx.screen === 'map'
        ? { title: 'There it is!', body: 'Every saved place gets a pin. Tap a pin to open it. Your location is only ever shown to you.', needsNext: true }
        : { title: 'See it on the map', body: 'Every place you save gets a pin. Take a look.', hint: 'Tap Map.', anchor: '[data-tour="map-tab"]' };

    case 'coll': {
      const created = ctx.collections.length > ctx.startCollections;
      const moved = Boolean(place && ctx.placeCollectionAtStart && place.collection_id !== ctx.placeCollectionAtStart);
      if (moved) return { title: 'Moved!', body: 'Your place now lives in your new collection.', done: true };
      if (!created) {
        return ctx.settingsOpen
          ? { title: 'Name it', body: 'Type a name, like Weekend eats, then tap the add button.', hint: 'Add your collection.', anchor: '[data-tour="new-collection"]' }
          : { title: 'Make a new collection', body: 'Collections keep places together, like Weekend eats. Open Settings to make one.', hint: 'Tap the settings button.', anchor: '[data-tour="gear"]' };
      }
      const note = 'Only the person who saved a place can move it.';
      if (isOpen(ctx, ctx.editPinId)) {
        return ctx.has('[data-tour="move-form"]')
          ? { title: 'Pick the collection', body: `Choose your new collection, then tap Move. ${note}`, hint: 'Choose it, then tap Move.', anchor: '[data-tour="move-form"]' }
          : { title: 'Copy or move', body: `Tap Copy or move. ${note}`, hint: 'Tap Copy or move.', anchor: '[data-tour="move-open"]' };
      }
      if (isOpen(ctx, ctx.openPinId)) return { title: 'Open the editor', body: `Tap the pencil to edit, copy or move this place. ${note}`, hint: 'Tap the pencil.', anchor: '[data-tour="edit"]' };
      return { title: 'Move your place', body: `Let's move your place into it. ${note} Tap your place to open it.`, hint: 'Tap your place.', anchor: place ? placeAnchor(placeKey) : null };
    }

    case 'share': {
      const collectionId = ctx.shareCollectionId ?? place?.collection_id;
      const done = ctx.inviteSent; // stays true after the Share window closes itself
      if (ctx.shareOpen) {
        return { title: 'Send the invite', body: "One tap opens your phone's share sheet with a ready message. Anyone who joins can vote, and you can let them edit later.", hint: 'Tap Send invite.', anchor: '[data-tour="invite"]', done, skipLabel: 'Do this later' };
      }
      if (ctx.settingsOpen) {
        return { title: 'Share the collection', body: 'Collections are better together. Tap the button on your collection to invite your person.', hint: 'Tap the highlighted button.', anchor: collectionId ? `[data-tour="share"][data-tour-for="${collectionId}"]` : null, done, skipLabel: 'Do this later' };
      }
      return { title: 'Share the collection', body: 'Collections are better together. Open Settings to invite your person.', hint: 'Tap the settings button.', anchor: '[data-tour="gear"]', done, skipLabel: 'Do this later' };
    }

    case 'notes':
      return ctx.notificationsOpen
        ? { title: 'Your notifications', body: 'This is your newest one. Everyone in a collection hears about bookings, votes and new people. Tap one to jump to it, or swipe left to clear it.', anchor: ctx.has('[data-tour="note-first"]') ? '[data-tour="note-first"]' : '[data-tour="notes"]', needsNext: true }
        : { title: 'Stay in the loop', body: 'Everyone in a collection gets told when someone votes, books or joins. Tap the bell.', hint: 'Tap the bell.', anchor: '[data-tour="bell"]' };

    case 'install':
      return { title: 'Add Waylit to your Home Screen', body: 'On iPhone, notifications only work from the Home Screen. In Safari tap the Share button, then Add to Home Screen, and open Waylit from there.', needsNext: true };

    case 'notify': {
      if (!ctx.settingsOpen) {
        return { title: 'Never miss it', body: 'Notifications are on by default. Open Settings to choose a day and time for your weekly pick.', hint: 'Tap the settings button.', anchor: '[data-tour="gear"]', skipLabel: 'Do this later' };
      }
      const anchor = '[data-tour="notify"]';
      if (ctx.pushState === 'default') {
        return { title: 'Allow notifications', body: 'They are on for your account. Allow them on this phone to get reminders, votes and booking updates. You can also choose a day and time for your weekly pick, or turn it off.', anchor, needsNext: true, extra: { label: 'Allow on this phone', action: 'allow-push' } };
      }
      if (ctx.pushState === 'denied') {
        return { title: 'Notifications are blocked', body: 'This phone is blocking them. You can allow Waylit in your browser settings. Your weekly pick day and time are here too.', anchor, needsNext: true };
      }
      if (ctx.pushState === 'unsupported') {
        return { title: 'Notifications on your phone', body: 'They work once Waylit is on your Home Screen. Your weekly pick day and time are here too, and you can turn it off.', anchor, needsNext: true };
      }
      return { title: 'Your notifications are on', body: "You'll get reminders, votes and booking updates. Choose a day and time for your weekly pick, or turn it off.", anchor, needsNext: true };
    }

    case 'vote': {
      const vp = ctx.votablePlace;
      const key = vp ? `${vp.collection_id}:${vp.id}` : null;
      const voted = Boolean(vp?.reactions?.[ctx.userId]);
      if (isOpen({ placeKey: key, place: vp }, ctx.openPinId)) {
        return { title: 'Cast your vote', body: 'Tap how keen you are. Everyone in the collection can see who is in.', hint: voted ? '' : 'Tap Keen, Maybe or Meh.', anchor: '[data-tour="vote-board"]', needsNext: voted };
      }
      return { title: 'Have a look', body: 'Someone saved this place for you. Tap it to open it and vote.', hint: 'Tap the place.', anchor: key ? placeAnchor(key) : null };
    }

    default:
      return { title: "You're all set! 🎉", body: 'Save a few more reels and plan something. You can replay this tour from Settings any time.' };
  }
}

// Closing everything the tour might have left open, so each step starts from a clean screen.
export function closeAll(actions) {
  actions.closePin();
  actions.closeEdit();
  actions.closeSettings();
  actions.closeShare();
  actions.closeNotifications();
}

// What to do once, as a step starts.
export function enter(id, ctx, actions) {
  if (id === 'map') actions.showAllOnMap?.();
  if (['keen', 'book', 'coll', 'share', 'notify', 'vote'].includes(id)) actions.setScreen('home');
  if (id !== 'paste' && id !== 'confirm' && id !== 'welcome') closeAll(actions);
}

// What to keep true while a step is showing (safe to run again and again).
export function keepTrue(id, ctx, actions) {
  if (id === 'coll') {
    const created = ctx.collections.length > ctx.startCollections;
    const moved = Boolean(ctx.place && ctx.placeCollectionAtStart && ctx.place.collection_id !== ctx.placeCollectionAtStart);
    if (created && ctx.settingsOpen) actions.closeSettings();
    if (moved) { actions.closePin(); actions.closeEdit(); }
  }
  if (id === 'share' && ctx.inviteSent && ctx.shareOpen) actions.closeShare();
}
