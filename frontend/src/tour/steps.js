// What the first-run tour says and points at. Nothing here touches the screen: every step is described from a
// plain `ctx` object (the app's current state), so it can be tested on its own.
//
// ctx: { shareCollectionId, variant, name, isWide, isIos, standalone, place, placeKey, hasVotablePlace, votablePlace, userId,
//        collections, startCollections, placeCollectionAtStart, openPinId, editPinId, settingsOpen, shareOpen,
//        notificationsOpen, screen, inboxItems, inviteSent, has(selector) }

// A sample place made for the tour carries this note, so it can always be found and removed again.
export const TOUR_MARK = 'Sample for the tour. It is removed when the tour ends.';
export const SAMPLE_PREFIX = 'tour-sample:';
export const SAMPLE_DETAILS = {
  name: 'Sample Noodle Bar',
  address: '1 Example St, Melbourne VIC 3000',
  latitude: -37.81837,
  longitude: 144.96719,
};

const placeAnchor = (key) => `[data-tour="place"][data-tour-for="${key}"]`;

// The steps for one run of the tour, in order, left out when they don't apply to this phone or screen.
export function stepsFor(variant, ctx) {
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
      return ctx.variant === 'partner'
        ? { title: `Welcome${nm}!`, body: "You've joined a shared collection. Here's a quick look at how to vote, stay in the loop and plan together. About a minute, and you can skip any time." }
        : { title: `Hey${ctx.name ? ` ${ctx.name}` : ''}, welcome to Waylit!`, body: "Let's turn a reel into a plan. It takes about a minute, and you can skip any time." };

    case 'paste':
      return {
        title: 'Save a reel',
        body: 'Copied a reel link? Tap Paste a reel link. You can also share from Instagram, use the iPhone Shortcut, or add one by hand with the + button.',
        hint: 'Tap the highlighted button, or try a sample.',
        anchor: '[data-tour="paste"]',
        done: ctx.inboxItems.length > 0 || Boolean(place),
        extra: ctx.inboxItems.length === 0 && !place ? { label: 'Use a sample reel', action: 'sample' } : null,
      };

    case 'confirm': {
      if (ctx.has('[data-tour="confirm"]')) {
        return { title: 'Is this the spot?', body: "We found a place. Check it's right, then tap Save. Wrong one? Tap Wrong place to pick another.", hint: 'Tap Save.', anchor: '[data-tour="confirm"]', done: Boolean(place) };
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
        return { title: 'Booked!', body: "Everyone in the collection is told, and you get reminders. Each person sees the time in their own time zone.", needsNext: true };
      }
      if (isOpen(ctx, ctx.openPinId)) {
        return { title: 'Make it a plan', body: 'Pick a time, then tap Next to save it. Everyone in the collection is told.', hint: 'Follow the highlighted steps.', anchor: '[data-tour="plan"]' };
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
          ? { title: 'Name it', body: 'Type a name, like Date ideas, then tap the add button.', hint: 'Add your collection.', anchor: '[data-tour="new-collection"]' }
          : { title: 'Make a new collection', body: 'Collections keep places together, like Date ideas. Open Settings to make one.', hint: 'Tap the settings button.', anchor: '[data-tour="gear"]' };
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
        ? { title: 'Your notifications', body: 'Everyone in a collection hears about bookings, votes and new people. Tap one to jump to it, or swipe left to clear it.', anchor: '[data-tour="notes"]', needsNext: true }
        : { title: 'Stay in the loop', body: 'Everyone in a collection gets told when someone votes, books or joins. Tap the bell.', hint: 'Tap the bell.', anchor: '[data-tour="bell"]' };

    case 'install':
      return { title: 'Add Waylit to your Home Screen', body: 'On iPhone, notifications only work from the Home Screen. In Safari tap the Share button, then Add to Home Screen, and open Waylit from there.', needsNext: true };

    case 'notify':
      return ctx.settingsOpen
        ? { title: 'Turn on notifications', body: 'Get reminders and votes on your phone, and pick a day for your weekly pick.', hint: 'Switch notifications on, then tap Next.', anchor: '[data-tour="notify"]', needsNext: true, skipLabel: 'Do this later' }
        : { title: 'Never miss it', body: 'Open Settings to turn on phone notifications and pick a day for your weekly pick.', hint: 'Tap the settings button.', anchor: '[data-tour="gear"]', skipLabel: 'Do this later' };

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
