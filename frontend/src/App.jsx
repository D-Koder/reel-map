import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Bell, House, Map as MapIcon, Plus, SlidersHorizontal, TriangleAlert, WifiOff } from 'lucide-react';
import HomeScreen from './components/HomeScreen';
import MapScreen from './components/MapScreen';
import PinModal from './components/PinModal';
import EditPlaceSheet from './components/EditPlaceSheet';
import AddPlaceSheet from './components/AddPlaceSheet';
import SettingsDrawer from './components/SettingsDrawer';
import DeleteAccountModal from './components/DeleteAccountModal';
import NotificationPanel from './components/NotificationPanel';
import AuthScreen from './components/AuthScreen';
import ShareCollectionModal from './components/ShareCollectionModal';
import ReelInbox from './components/ReelInbox';
import FridayPickCard from './components/FridayPickCard';
import Celebration from './components/Celebration';
import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { useInvites } from './hooks/useInvites';
import { useNearbyAlerts } from './hooks/useNearbyAlerts';
import { useNotifications } from './hooks/useNotifications';
import { useOnline } from './hooks/useOnline';
import { useReelCovers } from './hooks/useReelCovers';
import { rememberCollection, useReelInbox } from './hooks/useReelInbox';
import { useShortcutReels } from './hooks/useShortcutReels';
import { notificationTarget } from './lib/notificationTarget';
import { clearUserStorage, readJSON, writeJSON } from './lib/storage';
import { configError, supabase } from './lib/supabase';
import './App.css';

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div key={toast.key} className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

// How long a delete can be undone. The delete is only sent once this runs out.
const SHOW_LOCATION_KEY = 'reelmap:show-my-location';
const NEAR_ALERTS_KEY = 'reelmap:near-alerts';
const UNDO_MS = 5000;

function MainApp({ userId, showToast }) {
  const data = useAppData(userId, showToast);
  const online = useOnline();
  const { acceptInvite } = useInvites(userId, showToast);
  const [screen, setScreen] = useState('home');
  // Wide screens show the list and the map side by side (see the 900px rule in App.css).
  const [isWide, setIsWide] = useState(() => window.matchMedia?.('(min-width: 900px)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 900px)');
    if (!query) return undefined;
    const update = () => setIsWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Show my location on the map. Kept on this device only; the location itself is never saved.
  const [showMyLocation, setShowMyLocation] = useState(() => readJSON(SHOW_LOCATION_KEY, true));
  const toggleMyLocation = (on) => {
    setShowMyLocation(on);
    writeJSON(SHOW_LOCATION_KEY, on);
  };
  // Tell me when I'm near a place I'm keen on. Off until turned on, so the app doesn't ask
  // for location the moment it opens. This device only.
  const [nearAlerts, setNearAlerts] = useState(() => readJSON(NEAR_ALERTS_KEY, false));
  const toggleNearAlerts = (on) => {
    setNearAlerts(on);
    writeJSON(NEAR_ALERTS_KEY, on);
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { items: notifications, loaded: notificationsLoaded, unreadCount, markAllRead, clearAll } = useNotifications(userId);
  // A notification id from a tapped push (?notification=), opened once notifications have loaded.
  const [pendingNotificationId, setPendingNotificationId] = useState(null);
  const [openPinId, setOpenPinId] = useState(null);
  const mapScreenRef = useRef(null);
  const [editPinId, setEditPinId] = useState(null);
  const [adding, setAdding] = useState(false);
  // Set when the add sheet is opened from a map long-press: { name?, address, latitude, longitude, category? }.
  const [addDraft, setAddDraft] = useState(null);
  // Collection to pre-select when the add sheet opens from a collection's empty-state button.
  const [addCollectionId, setAddCollectionId] = useState(null);
  // A reel link shared into the installed app, waiting for the collections to load before the add sheet opens.
  const [pendingShareUrl, setPendingShareUrl] = useState(null);
  // The shared link the open add sheet should start from.
  const [sharedReelUrl, setSharedReelUrl] = useState(null);
  // What the background lookup found for a saved reel, so Finish doesn't look it up again.
  const [sharedReelData, setSharedReelData] = useState(null);
  // The inbox reel the add sheet is finishing, removed from the inbox once it is added.
  const [finishingInboxId, setFinishingInboxId] = useState(null);
  // The place just marked as done, for the celebration.
  const [celebrating, setCelebrating] = useState(null);

  // Deletes wait UNDO_MS before they are sent, so the toast can offer Undo. Keys: "place:<collection>:<place>" or "collection:<id>".
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set());
  const deleteTimers = useRef(new Map());
  const setHidden = (key, hidden) =>
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (hidden) next.add(key);
      else next.delete(key);
      return next;
    });

  const deferDelete = (key, label, commit) => {
    setHidden(key, true);
    const run = async () => {
      deleteTimers.current.delete(key);
      await commit();
      setHidden(key, false);
    };
    const timer = setTimeout(run, UNDO_MS);
    deleteTimers.current.set(key, { timer, run });
    showToast(`Deleted ${label}`, {
      label: 'Undo',
      onClick: () => {
        clearTimeout(timer);
        deleteTimers.current.delete(key);
        setHidden(key, false);
        showToast('Restored');
      },
    }, UNDO_MS);
  };

  // Send waiting deletes right away if the app is hidden, closed or signed out, so none are lost.
  useEffect(() => {
    const flush = () => {
      for (const { timer, run } of deleteTimers.current.values()) {
        clearTimeout(timer);
        run();
      }
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const collections = useMemo(
    () => data.collections.filter((c) => !hiddenKeys.has(`collection:${c.id}`)),
    [data.collections, hiddenKeys]
  );
  const places = useMemo(
    () => data.places.filter((p) => !hiddenKeys.has(`collection:${p.collection_id}`) && !hiddenKeys.has(`place:${p.collection_id}:${p.id}`)),
    [data.places, hiddenKeys]
  );

  const inbox = useReelInbox({
    userId,
    collections,
    places,
    addPlace: data.addPlace,
    createInboxCollection: data.createInboxCollection,
    online,
    showToast,
    onSaved: (placeId, name, collectionName) =>
      showToast(`"${name}" saved to ${collectionName ?? 'your collection'}`, { label: 'Edit', onClick: () => setEditPinId(placeId) }, 5000),
  });

  // Reels saved by the iPhone Shortcut while the app was closed join the inbox.
  useNearbyAlerts({
    userId,
    places,
    enabled: nearAlerts,
    onNear: (place, metres) => {
      const message = `You're ${metres < 50 ? 'right by' : `${metres} m from`} ${place.name}. You're keen on it!`;
      showToast(message, { label: 'Open', onClick: () => setOpenPinId(`${place.collection_id}:${place.id}`) }, 8000);
      navigator.vibrate?.([30, 60, 30]);
    },
  });

  useShortcutReels({ userId, ready: !data.loading, enqueue: inbox.enqueue });

  // Coming back online: load anything that changed while offline.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) data.refresh();
    wasOnline.current = online;
  }, [online, data]);
  const openAddAt = (draft) => {
    setSharedReelUrl(null);
    setSharedReelData(null);
    setFinishingInboxId(null);
    setAddDraft(draft);
    setAddCollectionId(null);
    setAdding(true);
  };

  const openAddInCollection = (collectionId) => {
    setSharedReelUrl(null);
    setSharedReelData(null);
    setFinishingInboxId(null);
    setAddDraft(null);
    setAddCollectionId(collectionId);
    setAdding(true);
  };
  const [shareModal, setShareModal] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Opens the add sheet for a shared reel the background lookup couldn't finish.
  const finishInboxItem = (item) => {
    setSharedReelUrl(item.url);
    setSharedReelData(item.reelData ?? null);
    setFinishingInboxId(item.id);
    setAddDraft(null);
    setAddCollectionId(item.collectionId);
    setAdding(true);
  };

  const membersOf = useMemo(
    () => Object.fromEntries(collections.map((c) => [c.id, c.members])),
    [collections]
  );

  // A fresh cover goes first, with the saved link kept as a backup: Instagram's fresh links
  // sometimes refuse to load on other sites. If neither loads, the card shows its colour tile.
  const covers = useReelCovers(places);
  const placesWithCovers = useMemo(
    () => places.map((place) => {
      const fresh = covers.map[place.reel_url]?.thumbnail_url;
      return fresh && fresh !== place.reel_thumbnail_url
        ? { ...place, reel_thumbnail_url: fresh, saved_thumbnail_url: place.reel_thumbnail_url }
        : place;
    }),
    [places, covers.map]
  );

  const streak = useMemo(() => {
    return data.profile?.current_streak ?? 0;
  }, [data.profile]);

  const closePin = () => {
    mapScreenRef.current?.markModalClosing();
    setOpenPinId(null);
  };

  // Handle invite codes from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) {
      acceptInvite(inviteCode).then((success) => {
        if (success) {
          data.refresh();
          // Remove the invite parameter from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      });
    }
  }, [acceptInvite, data]);

  // Reel links shared to the installed app arrive as ?url=, ?text= or ?title= (see manifest share_target).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // A Friday pick notification opens its place. The pin is looked up once places have loaded.
    if (params.has('notification')) {
      setPendingNotificationId(params.get('notification'));
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (params.has('pick')) {
      setOpenPinId(params.get('pick'));
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (!['url', 'text', 'title'].some((key) => params.has(key))) return;
    const shared = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean).join(' ');
    const link = shared.match(/https?:\/\/\S+/)?.[0] ?? null;
    window.history.replaceState({}, document.title, window.location.pathname);
    if (link) setPendingShareUrl(link);
  }, []);

  // A shared reel is saved straight away and looked up in the background: no sheet, no extra taps.
  useEffect(() => {
    if (!pendingShareUrl || data.loading) return;
    setPendingShareUrl(null);
    setScreen('home');
    inbox.enqueue(pendingShareUrl);
  }, [pendingShareUrl, data.loading, inbox]);

  // Takes you to what a notification is about: a place opens its card, so you see the update;
  // a collection is scrolled to on Home.
  const openTarget = (target) => {
    if (!target) return false;
    setNotificationsOpen(false);
    if (target.place) {
      setOpenPinId(`${target.place.collection_id}:${target.place.id}`);
    } else {
      setScreen('home');
      requestAnimationFrame(() => {
        const board = document.getElementById(`collection-${target.collection.id}`);
        if (!board) return;
        board.scrollIntoView({ behavior: 'smooth', block: 'start' });
        board.classList.remove('collection-flash');
        void board.offsetWidth; // restart the highlight animation
        board.classList.add('collection-flash');
      });
    }
    return true;
  };
  const targetOf = (notification) => notificationTarget(notification, places, collections);

  useEffect(() => {
    if (!pendingNotificationId || !notificationsLoaded) return;
    setPendingNotificationId(null);
    if (!openTarget(targetOf(notifications.find((n) => n.id === pendingNotificationId)))) {
      setNotificationsOpen(true);
      markAllRead();
    }
    // openTarget and targetOf read the latest places on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotificationId, notificationsLoaded]);

  const deletePlace = (place) => {
    closePin();
    deferDelete(`place:${place.collection_id}:${place.id}`, `"${place.name}"`, () => data.deletePlace(place.collection_id, place.id));
  };

  const deleteCollection = (collectionId) => {
    const collection = data.collections.find((c) => c.id === collectionId);
    deferDelete(`collection:${collectionId}`, `"${collection?.name ?? 'collection'}"`, () => data.deleteCollection(collectionId));
    return true;
  };

  const markDone = async (place) => {
    if (!(await data.markDone(place))) return;
    closePin();
    setCelebrating({ name: place.name });
  };

  const handleTransferOwnership = async (collectionId, newOwnerId) => {
    if (await data.transferOwnership(collectionId, newOwnerId)) {
      showToast('Ownership transferred');
      return true;
    }
    return false;
  };

  const handleDeleteUser = async (cascadeDelete = false) => {
    setIsDeleting(true);
    if (await data.deleteUser(cascadeDelete)) {
      clearUserStorage(userId);
      showToast('Account deleted');
      setDeleteModalOpen(false);
      await supabase.auth.signOut();
    } else {
      setIsDeleting(false);
    }
  };

  if (data.loading) {
    return <div className="center-screen"><span className="spinner" aria-hidden="true" />Loading your places…</div>;
  }
  if (data.error && !data.profile) {
    return (
      <div className="center-screen">
        <p>Couldn't load your data: {data.error}</p>
        <button className="step-btn primary" onClick={data.refresh}>
          Try again
        </button>
      </div>
    );
  }

  // A copied place is one row per collection, all sharing the place id, so pins are opened by
  // "collection:place". A bare place id (from a notification or a just-saved reel) opens its first entry.
  const findEntry = (key) => key && (placesWithCovers.find((p) => `${p.collection_id}:${p.id}` === key) ?? placesWithCovers.find((p) => p.id === key));
  const openPin = findEntry(openPinId);
  const editPin = findEntry(editPinId);

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">waylit<span className="wordmark-plans"> plans</span><span className="wordmark-dot" aria-hidden="true">.</span></span>
        <div className="header-buttons">
          <button
            className="header-btn"
            onClick={() => { setNotificationsOpen(true); markAllRead(); }}
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <span style={{ marginLeft: 2, fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '0 5px' }}>
                {unreadCount}
              </span>
            )}
          </button>
          <button className="header-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <SlidersHorizontal aria-hidden="true" />
          </button>
        </div>
      </header>

      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff className="ico" aria-hidden="true" /> You're offline. Showing your saved places — changes need a connection.
        </div>
      )}

      {/* Both panels stay mounted: on mobile only the active tab shows, on wide screens they sit side by side. */}
      <main className="content">
        <section className={`panel panel-home ${screen === 'home' ? 'active' : ''}`}>
          <HomeScreen
            userId={userId}
            places={placesWithCovers}
            collections={collections}
            onCoverVisible={covers.requestCover}
            onCoverHidden={covers.cancelCover}
            banner={
              <>
                <ReelInbox items={inbox.items} onFinish={finishInboxItem} onRetry={inbox.retry} onDismiss={inbox.remove} />
                <FridayPickCard userId={userId} placeCount={places.length} showToast={showToast} />
              </>
            }
            membersOf={membersOf}
            streak={streak}
            onOpenPin={setOpenPinId}
            onReorder={data.reorder}
            onAddPlace={openAddInCollection}
            onCreateSample={async () => {
              if (await data.createSampleData()) showToast('Added sample places');
            }}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {/* Wide screens have no tab bar, so the + floats over the list there. */}
          {collections.length > 0 && (
            <button className="fab fab-float" onClick={() => openAddAt(null)} aria-label="Add a place">
              <Plus aria-hidden="true" strokeWidth={2.5} />
            </button>
          )}
        </section>
        <section className={`panel panel-map ${screen === 'map' ? 'active' : ''}`}>
          <MapScreen ref={mapScreenRef} places={places} collections={collections} membersOf={membersOf} showMyLocation={showMyLocation} onScreen={screen === 'map' || isWide} onOpenPin={setOpenPinId} onAddAt={openAddAt} showToast={showToast} />
        </section>
      </main>

      <nav className="bottom-nav">
        {[
          { id: 'home', Icon: House, label: 'Home' },
          { id: 'add' },
          { id: 'map', Icon: MapIcon, label: 'Map' },
        ].map((tab) =>
          tab.id === 'add' ? (
            <button
              key="add"
              className="fab fab-nav"
              onClick={() => openAddAt(null)}
              disabled={collections.length === 0}
              aria-label="Add a place"
            >
              <Plus aria-hidden="true" strokeWidth={2.5} />
            </button>
          ) : (
            <button
              key={tab.id}
              className={`nav-tab ${screen === tab.id ? 'active' : ''}`}
              onClick={() => setScreen(tab.id)}
              aria-current={screen === tab.id ? 'page' : undefined}
            >
              <tab.Icon className="nav-icon" aria-hidden="true" strokeWidth={screen === tab.id ? 2.4 : 1.8} />
              <span className="nav-label">{tab.label}</span>
            </button>
          )
        )}
      </nav>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={userId}
        profile={data.profile}
        collections={collections}
        onCreateCollection={data.createCollection}
        onUpdateCollection={data.updateCollection}
        onSetPrivacy={data.setCollectionPrivate}
        onUpdateProfile={data.updateProfile}
        onRemoveCollectionMember={data.removeCollectionMember}
        onDeleteCollection={deleteCollection}
        showToast={showToast}
        onShare={setShareModal}
        onOpenDeleteModal={() => setDeleteModalOpen(true)}
        showMyLocation={showMyLocation}
        onToggleMyLocation={toggleMyLocation}
        nearAlerts={nearAlerts}
        onToggleNearAlerts={toggleNearAlerts}
        onReorderCollections={data.reorderCollections}
      />

      <DeleteAccountModal
        open={deleteModalOpen}
        onClose={() => !isDeleting && setDeleteModalOpen(false)}
        userId={userId}
        collections={collections}
        onTransferOwnership={handleTransferOwnership}
        onConfirmDelete={handleDeleteUser}
        isDeleting={isDeleting}
      />

      <NotificationPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onClear={clearAll}
        canOpen={(notif) => Boolean(targetOf(notif))}
        onOpen={(notif) => openTarget(targetOf(notif))}
      />

      {openPin && !editPin && (
        <PinModal
          key={`${openPin.collection_id}:${openPin.id}`}
          place={openPin}
          userId={userId}
          members={membersOf[openPin.collection_id] ?? []}
          onSetVibe={(feeling) => data.setReaction(openPin, feeling)}
          onBook={(plannedAt) => data.book(openPin, plannedAt)}
          onMarkDone={() => markDone(openPin)}
          onEdit={() => setEditPinId(`${openPin.collection_id}:${openPin.id}`)}
          onDelete={() => deletePlace(openPin)}
          onClose={closePin}
          showToast={showToast}
        />
      )}

      {editPin && (
        <EditPlaceSheet
          key={`${editPin.collection_id}:${editPin.id}`}
          place={editPin}
          collections={collections}
          places={places}
          eventDatesReady={data.eventDatesReady}
          userId={userId}
          onCopy={async (targetId) => {
            const ok = await data.copyPlaceToCollection(editPin, targetId);
            if (ok) showToast('Copied to collection');
            return ok;
          }}
          onMove={async (targetId) => {
            const ok = await data.movePlaceToCollection(editPin, targetId);
            if (ok) showToast('Moved to collection');
            return ok;
          }}
          onSave={async (patch) => {
            if (await data.updatePlace(editPin, patch)) {
              showToast(`Saved "${patch.name}"`);
              setEditPinId(null);
            }
          }}
          onClose={() => setEditPinId(null)}
        />
      )}

      {adding && (
        <AddPlaceSheet
          initialPlace={addDraft}
          initialCollectionId={addCollectionId}
          initialReelUrl={sharedReelUrl}
          initialReelData={sharedReelData}
          onCreateCollection={data.createCollection}
          collections={collections}
          places={places}
          eventDatesReady={data.eventDatesReady}
          onAdd={async (fields) => {
            const created = await data.addPlace(fields);
            if (created) {
              rememberCollection(userId, fields.collectionId);
              if (finishingInboxId) inbox.remove(finishingInboxId);
              setFinishingInboxId(null);
              showToast(`Added "${fields.name}"`);
              setAdding(false);
            }
          }}
          onClose={() => {
            setAdding(false);
            setAddDraft(null);
            setSharedReelUrl(null);
            setSharedReelData(null);
            setFinishingInboxId(null);
          }}
        />
      )}

      {celebrating && (
        <Celebration placeName={celebrating.name} streak={streak} onClose={() => setCelebrating(null)} />
      )}

      {shareModal && (
        <ShareCollectionModal
          collection={shareModal}
          userId={userId}
          onClose={() => setShareModal(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function App() {
  const { session, recovering, doneRecovering } = useAuth();
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, action, duration) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), duration ?? (action ? 4000 : 2500));
  }, []);

  let body;
  if (configError) {
    body = (
      <div className="center-screen">
        <p className="config-error"><TriangleAlert className="ico" aria-hidden="true" /> {configError}</p>
      </div>
    );
  } else if (session === undefined) {
    body = <div className="center-screen"><span className="spinner" aria-hidden="true" />Loading…</div>;
  } else if (recovering) {
    body = (
      <AuthScreen
        mode="reset"
        onPasswordReset={() => {
          doneRecovering();
          showToast('Password updated');
        }}
      />
    );
  } else if (!session) {
    body = <AuthScreen />;
  } else {
    body = <MainApp key={session.user.id} userId={session.user.id} showToast={showToast} />;
  }

  return (
    <>
      {body}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

export default App;
