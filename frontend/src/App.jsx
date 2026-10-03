import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
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
import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { useInvites } from './hooks/useInvites';
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

function MainApp({ userId, showToast }) {
  const data = useAppData(userId, showToast);
  const { acceptInvite } = useInvites(showToast);
  const [screen, setScreen] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [openPinId, setOpenPinId] = useState(null);
  const [editPinId, setEditPinId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [shareModal, setShareModal] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const membersOf = useMemo(
    () => Object.fromEntries(data.collections.map((c) => [c.id, c.members])),
    [data.collections]
  );

  const streak = useMemo(() => {
    return data.profile?.current_streak ?? 0;
  }, [data.profile]);

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

  const addNotification = useCallback((type, message, icon) => {
    const id = Date.now();
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const time = `${hours}:${minutes}`;

    setNotifications((prev) => [
      { id, type, message, icon, time },
      ...prev,
    ]);
  }, []);

  const deletePlace = async (place) => {
    if (!(await data.deletePlace(place.id))) return;
    addNotification('deleted', `Deleted "${place.name}"`, '🗑️');
    setOpenPinId(null);
    showToast(`🗑️ Deleted "${place.name}"`, {
      label: 'Undo',
      onClick: async () => {
        if (await data.restorePlace(place.id)) showToast(`↩️ Restored "${place.name}"`);
      },
    });
  };

  const markDone = async (place) => {
    if (!(await data.markDone(place.id))) return;
    showToast(`✅ Marked "${place.name}" as done!`);
    setOpenPinId(null);
  };

  const handleTransferOwnership = async (collectionId, newOwnerId) => {
    if (await data.transferOwnership(collectionId, newOwnerId)) {
      showToast('✓ Ownership transferred');
      return true;
    }
    return false;
  };

  const handleDeleteUser = async () => {
    setIsDeleting(true);
    if (await data.deleteUser()) {
      showToast('Account deleted');
      setDeleteModalOpen(false);
      await supabase.auth.signOut();
    } else {
      setIsDeleting(false);
    }
  };

  if (data.loading) {
    return <div className="center-screen">Loading your places…</div>;
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

  const openPin = data.places.find((p) => p.id === openPinId);
  const editPin = data.places.find((p) => p.id === editPinId);

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">🗺️ Reel Map</span>
        <div className="header-buttons">
          <button className="header-btn" onClick={() => setNotificationsOpen(true)} aria-label="Notifications">
            🔔
          </button>
          <button className="header-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {/* Both panels stay mounted: on mobile only the active tab shows, on wide screens they sit side by side. */}
      <main className="content">
        <section className={`panel panel-home ${screen === 'home' ? 'active' : ''}`}>
          <HomeScreen
            userId={userId}
            places={data.places}
            collections={data.collections}
            membersOf={membersOf}
            streak={streak}
            onOpenPin={setOpenPinId}
            onReorder={data.reorder}
            onCreateSample={async () => {
              if (await data.createSampleData()) showToast('✨ Added sample places');
            }}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {data.collections.length > 0 && (
            <button className="fab" onClick={() => setAdding(true)} aria-label="Add a place">
              ＋
            </button>
          )}
        </section>
        <section className={`panel panel-map ${screen === 'map' ? 'active' : ''}`}>
          <MapScreen places={data.places} membersOf={membersOf} onOpenPin={setOpenPinId} showToast={showToast} />
        </section>
      </main>

      <nav className="bottom-nav">
        {[
          { id: 'home', icon: '🏠', label: 'Home' },
          { id: 'map', icon: '📍', label: 'Map' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${screen === tab.id ? 'active' : ''}`}
            onClick={() => setScreen(tab.id)}
            aria-current={screen === tab.id ? 'page' : undefined}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={userId}
        profile={data.profile}
        collections={data.collections}
        onCreateCollection={data.createCollection}
        onUpdateCollection={data.updateCollection}
        onUpdateProfile={data.updateProfile}
        showToast={showToast}
        onShare={setShareModal}
        onOpenDeleteModal={() => setDeleteModalOpen(true)}
      />

      <DeleteAccountModal
        open={deleteModalOpen}
        onClose={() => !isDeleting && setDeleteModalOpen(false)}
        userId={userId}
        collections={data.collections}
        onTransferOwnership={handleTransferOwnership}
        onConfirmDelete={handleDeleteUser}
        isDeleting={isDeleting}
      />

      <NotificationPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onClear={() => setNotifications([])}
      />

      {openPin && !editPin && (
        <PinModal
          key={openPin.id}
          place={openPin}
          userId={userId}
          members={membersOf[openPin.collection_id] ?? []}
          onSetVibe={(feeling) => data.setReaction(openPin, feeling)}
          onBook={(plannedAt) => data.book(openPin.id, plannedAt)}
          onMarkDone={() => markDone(openPin)}
          onEdit={() => setEditPinId(openPin.id)}
          onDelete={() => deletePlace(openPin)}
          onClose={() => setOpenPinId(null)}
          showToast={showToast}
        />
      )}

      {editPin && (
        <EditPlaceSheet
          key={editPin.id}
          place={editPin}
          onSave={async (patch) => {
            if (await data.updatePlace(editPin.id, patch)) {
              showToast(`✏️ Saved "${patch.name}"`);
              setEditPinId(null);
            }
          }}
          onClose={() => setEditPinId(null)}
        />
      )}

      {adding && (
        <AddPlaceSheet
          collections={data.collections}
          onAdd={async (fields) => {
            const created = await data.addPlace(fields);
            if (created) {
              addNotification('added', `Added "${fields.name}" to a collection`, '📍');
              showToast(`📍 Added "${fields.name}"`);
              setAdding(false);
            }
          }}
          onClose={() => setAdding(false)}
        />
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

  const showToast = useCallback((message, action) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), action ? 4000 : 2500);
  }, []);

  let body;
  if (configError) {
    body = (
      <div className="center-screen">
        <p className="config-error">⚙️ {configError}</p>
      </div>
    );
  } else if (session === undefined) {
    body = <div className="center-screen">Loading…</div>;
  } else if (recovering) {
    body = (
      <AuthScreen
        mode="reset"
        onPasswordReset={() => {
          doneRecovering();
          showToast('🔑 Password updated');
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
