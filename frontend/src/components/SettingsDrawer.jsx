import React, { useEffect, useState } from 'react';
import { Bell, Camera, ChevronDown, ChevronRight, CircleCheck, Download, Folder, KeyRound, Link, Lock, LockOpen, Pencil, Settings, Share2, Smartphone, User, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AVATARS, DEFAULT_AVATAR_URL } from '../lib/constants';
import { clearUserStorage } from '../lib/storage';
import { disableFridayPick, enableFridayPick, getPushSubscription, isPushSupported } from '../lib/push';

// On/off switch for the weekly Friday pick notification. This device only; the server keeps one row per device.
function FridayPickToggle({ userId }) {
  const [supported] = useState(() => isPushSupported());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supported) return;
    getPushSubscription().then((sub) => setEnabled(Boolean(sub))).catch(() => {});
  }, [supported]);

  const toggle = async (event) => {
    const wantOn = event.target.checked;
    setBusy(true);
    setError('');
    try {
      if (wantOn) await enableFridayPick(userId);
      else await disableFridayPick();
      setEnabled(wantOn);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return <div className="toggle-hint">Friday pick notifications need the app installed to your home screen.</div>;
  }

  return (
    <div className="cascade-delete-toggle">
      <label>
        <input type="checkbox" checked={enabled} disabled={busy} onChange={toggle} />
        <Bell className="ico" aria-hidden="true" /> Notifications on this device
      </label>
      {error && <div className="toggle-hint">{error}</div>}
    </div>
  );
}

// Copies text and says so in a toast. Falls back to a prompt the user can copy from.
async function copyText(text, label, showToast) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${label}`);
  } catch {
    window.prompt(`Copy your ${label}:`, text);
  }
}

// The shared "Save to Reel Map" Shortcut (an iCloud link, safe to share: it holds no key).
// VITE_SHORTCUT_URL overrides it. The Shortcut's name must match SHORTCUT_NAME.
const SHORTCUT_URL = import.meta.env.VITE_SHORTCUT_URL || 'https://www.icloud.com/shortcuts/de02d20f85984aefbb0840cc8b3c6d25';
const SHORTCUT_NAME = 'Save to Reel Map';

// Runs the Shortcut with "reelmap-key:<key>". The Shortcut saves the key on the phone,
// so it is never pasted by hand. Running it again (after a new key) replaces the saved one.
function connectShortcut(key) {
  const params = new URLSearchParams({ name: SHORTCUT_NAME, input: 'text', text: `reelmap-key:${key}` });
  window.location.href = `shortcuts://run-shortcut?${params.toString().replace(/\+/g, '%20')}`;
}

// Set-up for the iPhone Shortcut that saves a reel from the share sheet without leaving Instagram.
// The app can't see which Shortcuts are installed, so the Shortcut reports in after Connect
// (shortcut_keys.connected_at). Not connected: Get the Shortcut + Connect. Connected: a tick + Reconnect.
function ShortcutSetup({ showToast }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [key, setKey] = useState('');
  const [connectedAt, setConnectedAt] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `${window.location.origin}/api/save-reel`;

  // Loads the key (made on first use) and whether the Shortcut has reported in.
  // Runs again when you come back from Shortcuts, so the tick shows straight away.
  useEffect(() => {
    if (!open) return undefined;
    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      const { data, error: rpcError } = await supabase.rpc('get_shortcut_key');
      if (rpcError) {
        setError('Could not load your key. Try again later.');
        return;
      }
      setError('');
      setKey(data);
      const { data: row } = await supabase.from('shortcut_keys').select('connected_at').maybeSingle();
      setConnectedAt(row?.connected_at ?? null);
    };
    load();
    document.addEventListener('visibilitychange', load);
    return () => document.removeEventListener('visibilitychange', load);
  }, [open]);

  const resetKey = async () => {
    if (!window.confirm('Make a new key? Your Shortcut stops working until you tap Connect again.')) return;
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('reset_shortcut_key');
    setBusy(false);
    if (rpcError) {
      showToast('Could not make a new key');
      return;
    }
    setKey(data);
    setConnectedAt(null);
    showToast('New key made. Tap Connect to update your Shortcut.');
  };

  return (
    <div className="settings-section">
      <button type="button" className="settings-section-title settings-section-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Smartphone className="ico" aria-hidden="true" /> Save reels without leaving Instagram {open ? <ChevronDown className="ico" aria-hidden="true" /> : <ChevronRight className="ico" aria-hidden="true" />}
      </button>
      {open && (
        <div className="shortcut-setup">
          <p className="toggle-hint">An iPhone Shortcut saves the reel in the background. You stay in Instagram. The place shows up next time you open Reel Map.</p>

          {error && <span className="toggle-hint">{error}</span>}
          {connectedAt ? (
            <>
              <div className="shortcut-connected" role="status">
                <strong><CircleCheck className="ico" aria-hidden="true" /> Shortcut connected</strong>
                <span>Share a reel → tap <strong>{SHORTCUT_NAME}</strong></span>
              </div>
              <button type="button" className="step-btn secondary full-width" disabled={!key} onClick={() => connectShortcut(key)}>
                <Link className="ico" aria-hidden="true" /> Reconnect
              </button>
              <p className="toggle-hint">New phone, or the Shortcut stopped working? Get it again, then tap Reconnect.</p>
              {SHORTCUT_URL && (
                <a className="settings-link-btn" href={SHORTCUT_URL} target="_blank" rel="noreferrer"><Download className="ico" aria-hidden="true" /> Get the Shortcut again</a>
              )}
            </>
          ) : (
            <>
              <p className="shortcut-status">Not set up on this account yet.</p>
              {SHORTCUT_URL && (
                <a className="step-btn full-width" href={SHORTCUT_URL} target="_blank" rel="noreferrer">1. <Download className="ico" aria-hidden="true" /> Get the Shortcut</a>
              )}
              <button type="button" className="step-btn full-width" disabled={!key} onClick={() => connectShortcut(key)}>
                {SHORTCUT_URL ? '2. ' : ''}<Link className="ico" aria-hidden="true" /> Connect it to my account
              </button>
              <p className="toggle-hint">
                Already have the Shortcut? Just tap Connect. Shortcuts opens, saves your key and shows
                "✅ Reel Map connected". Then come back here.
              </p>
            </>
          )}

          <button type="button" className="settings-link-btn" aria-expanded={manual} onClick={() => setManual((v) => !v)}>
            {manual ? 'Hide' : 'Set it up by hand instead'}
          </button>
          {manual && (
            <>
              <div className="shortcut-field">
                <span className="input-label">Your web address</span>
                <code className="shortcut-code">{endpoint}</code>
                <button type="button" className="step-btn secondary" onClick={() => copyText(endpoint, 'address', showToast)}>Copy</button>
              </div>
              <div className="shortcut-field">
                <span className="input-label">Your secret key (don't share it)</span>
                <code className="shortcut-code">{key ? `${key.slice(0, 6)}••••••••` : 'Loading…'}</code>
                <button type="button" className="step-btn secondary" disabled={!key} onClick={() => copyText(key, 'key', showToast)}>Copy</button>
              </div>
              <ol className="shortcut-steps">
                <li>In <strong>Shortcuts</strong>, edit your Reel Map shortcut. Delete any <strong>Open URLs</strong> step.</li>
                <li>Tap <strong>ⓘ</strong>. Turn on <strong>Show in Share Sheet</strong> for <strong>URLs</strong> and <strong>Text</strong>.</li>
                <li>Add <strong>Get Contents of URL</strong> with the address. Method <strong>POST</strong>, Request Body <strong>JSON</strong>.</li>
                <li>Add 2 Text fields: <strong>key</strong> = your key. <strong>url</strong> = <strong>Shortcut Input</strong>.</li>
                <li>Add <strong>Show Notification</strong> with <strong>Contents of URL</strong>.</li>
              </ol>
            </>
          )}

          <button type="button" className="step-btn secondary full-width" disabled={busy} onClick={resetKey}><KeyRound className="ico" aria-hidden="true" /> Make a new key</button>
        </div>
      )}
    </div>
  );
}

function CollectionRow({ collection, isOwner, onRename, onTogglePrivacy, onShare, onRemoveMember, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState(collection.name);
  const owner = collection.members.find((m) => m.role === 'owner');

  const save = () => {
    const name = draft.trim();
    setEditing(false);
    if (!name || name === collection.name) {
      setDraft(collection.name);
      return;
    }
    onRename(collection, name);
  };

  return (
    <div className="collection-item">
      <div
        className={`collection-name ${isOwner ? '' : 'readonly'}`}
        onClick={() => isOwner && !editing && setEditing(true)}
        title={isOwner ? 'Tap to rename' : undefined}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={60}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setDraft(collection.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <>
            <span className="collection-name-text">
              {collection.emoji} {collection.name}
            </span>
            <span className="collection-meta">
              {isOwner ? 'Yours' : `Owned by ${owner?.display_name ?? 'someone'}`} · <Users className="ico" aria-hidden="true" /> {collection.members.length}
            </span>
          </>
        )}
      </div>
      {isOwner && (
        <div className="collection-icons">
          <button className="collection-icon" onClick={() => setManaging((open) => !open)} title="Manage collection" aria-label="Manage collection" aria-expanded={managing}>
            <Settings aria-hidden="true" />
          </button>
          <button
            className="collection-icon"
            onClick={() => onShare(collection)}
            title="Share collection"
            aria-label="Share"
          >
            <Share2 aria-hidden="true" />
          </button>
          <button
            className="collection-icon"
            onClick={() => onTogglePrivacy(collection)}
            title={collection.isPrivate ? 'Private — tap to share' : 'Shared — tap to make private'}
            aria-label={collection.isPrivate ? 'Make shared' : 'Make private'}
          >
            {collection.isPrivate ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
          </button>
        </div>
      )}
      {isOwner && managing && (
        <div className="collection-manage-panel">
          <div className="collection-manage-heading">Members</div>
          {collection.members.map((member) => (
            <div className="collection-member-row" key={member.id}>
              <span>{member.avatar_url ? <img className="collection-member-avatar" src={member.avatar_url} alt="" /> : member.avatar === '🙂' ? <img className="collection-member-avatar" src={DEFAULT_AVATAR_URL} alt="" /> : member.avatar}</span>
              <span className="collection-member-label">{member.display_name}{member.role === 'owner' ? ' · Owner' : ''}</span>
              {member.role !== 'owner' && <button type="button" className="collection-icon" aria-label={`Remove ${member.display_name}`} onClick={() => onRemoveMember(collection, member)}>−</button>}
            </div>
          ))}
          <button type="button" className="step-btn danger full-width" onClick={() => onDelete(collection)}>Delete collection</button>
        </div>
      )}
    </div>
  );
}

function ProfileSection({ profile, email, onUpdateProfile, onDeleteClick }) {
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(profile.display_name);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setPhotoError('Choose a JPG, PNG, or WebP image under 5 MB.');
      return;
    }
    setUploading(true);
    setPhotoError('');
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('profile-avatars').upload(path, file, { contentType: file.type });
    if (error) setPhotoError(error.message);
    else {
      const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const saved = await onUpdateProfile({ avatar_url: data.publicUrl });
      if (!saved) setPhotoError('Photo uploaded, but profile update failed.');
    }
    setUploading(false);
  };

  const handleSave = () => {
    const next = name.trim();
    if (next && next !== profile.display_name) {
      onUpdateProfile({ display_name: next });
    } else if (!next) {
      setName(profile.display_name);
    }
    setEditMode(false);
    setPickingAvatar(false);
  };

  const handleCancel = () => {
    setName(profile.display_name);
    setEditMode(false);
    setPickingAvatar(false);
  };

  const AvatarComponent = () => (
    profile.avatar_url ? (
      <img className="profile-avatar-image" src={profile.avatar_url} alt="Profile" />
    ) : profile.avatar === '🙂' ? (
      <img className="profile-avatar-image" src={DEFAULT_AVATAR_URL} alt="Profile" />
    ) : (
      profile.avatar
    )
  );

  return (
    <div className="settings-section">
      <div className="settings-section-title"><User className="ico" aria-hidden="true" /> You</div>

      {!editMode ? (
        <div className="profile-display-card">
          <div className="profile-avatar">
            <AvatarComponent />
          </div>
          <div className="profile-info">
            <div className="profile-name">{profile.display_name}</div>
            <div className="profile-email">{email}</div>
          </div>
        </div>
      ) : (
        <div className="profile-edit-card">
          <div className="profile-edit-header">
            <button
              className="profile-avatar profile-avatar-editable"
              onClick={() => setPickingAvatar((v) => !v)}
              aria-label="Change avatar"
              aria-expanded={pickingAvatar}
              title="Tap to change avatar"
            >
              <AvatarComponent />
            </button>
            <div className="profile-edit-fields">
              <label className="input-label">Display Name</label>
              <input
                className="step-input"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
                autoFocus
                aria-label="Profile name"
              />
              <label className="input-label">Email</label>
              <div className="input-readonly">{email}</div>
            </div>
          </div>

          {pickingAvatar && (
            <div className="avatar-picker-section">
              <div className="avatar-picker-label">Choose an emoji avatar</div>
              <div className="avatar-grid">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    className={`avatar-option ${profile.avatar === a ? 'selected' : ''}`}
                    onClick={() => {
                      onUpdateProfile({ avatar: a });
                      setPickingAvatar(false);
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="step-btn secondary profile-upload-btn full-width">
            {uploading ? <><span className="spinner" aria-hidden="true" />Uploading photo…</> : <><Camera className="ico" aria-hidden="true" /> Upload Profile Photo</>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={uploading} hidden />
          </label>
          {photoError && <div className="profile-photo-error" role="alert">{photoError}</div>}
        </div>
      )}

      {editMode ? (
        <div className="profile-edit-actions">
          <button className="step-btn secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="step-btn" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      ) : (
        <button className="step-btn secondary full-width" onClick={() => setEditMode(true)}>
          <Pencil className="ico" aria-hidden="true" /> Edit Profile
        </button>
      )}

      <div className="profile-actions">
        <button className="step-btn secondary full-width" onClick={() => {
          // Don't leave this account's saved places on the device for the next person.
          if (profile?.id) clearUserStorage(profile.id);
          supabase.auth.signOut();
        }}>
          Log out
        </button>
        <button className="step-btn danger full-width" onClick={onDeleteClick}>
          Delete Account
        </button>
      </div>
    </div>
  );
}

export default function SettingsDrawer({
  open,
  onClose,
  userId,
  profile,
  collections,
  onCreateCollection,
  onUpdateCollection,
  onSetPrivacy,
  onUpdateProfile,
  onRemoveCollectionMember,
  onDeleteCollection,
  showToast,
  onShare,
  onOpenDeleteModal,
}) {
  const [newName, setNewName] = useState('');
  const [email, setEmail] = useState('');

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  const rename = async (collection, name) => {
    if (await onUpdateCollection(collection.id, { name })) showToast(`Renamed to "${name}"`);
  };

  const togglePrivacy = async (collection) => {
    const makePrivate = !collection.isPrivate;
    const others = collection.members.filter((m) => m.role !== 'owner');
    if (makePrivate && others.length > 0) {
      const names = others.map((m) => m.display_name).join(', ');
      const ok = window.confirm(
        `Make "${collection.name}" private?\n\n` +
        `This removes ${others.length} member(s): ${names}.\n` +
        'They will be told they were removed. Open invite links will stop working.'
      );
      if (!ok) return;
    }
    const result = await onSetPrivacy(collection.id, makePrivate, makePrivate && others.length > 0);
    if (result.ok) {
      const removedNote = makePrivate && result.removed ? ` · removed ${result.removed}` : '';
      showToast(makePrivate ? `Now private${removedNote}` : 'Now shared');
    }
  };

  const removeMember = async (collection, member) => {
    if (window.confirm(`Remove ${member.display_name} from ${collection.name}?`)) {
      await onRemoveCollectionMember(collection.id, member.id);
    }
  };

  const deleteCollection = async (collection) => {
    if (window.confirm(`Delete "${collection.name}" and remove it for all members?`)) {
      await onDeleteCollection(collection.id);
    }
  };

  const addCollection = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await onCreateCollection(name)) {
      setNewName('');
      showToast(`Added "${name}"`);
    }
  };

  return (
    <>
      <div className={`overlay-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`settings-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="settings-close" onClick={onClose} aria-label="Close settings"><X aria-hidden="true" /></button>
        </div>

        <div className="settings-content">
          {profile && <ProfileSection key={profile.id} profile={profile} email={email} onUpdateProfile={onUpdateProfile} onDeleteClick={onOpenDeleteModal} />}
          {userId && <FridayPickToggle userId={userId} />}
          {userId && <ShortcutSetup showToast={showToast} />}

          <div className="settings-section">
            <div className="settings-section-title"><Folder className="ico" aria-hidden="true" /> Collections</div>
            {collections.map((c) => (
              <CollectionRow
                key={`${c.id}-${c.name}`}
                collection={c}
                isOwner={c.ownerId === userId}
                onRename={rename}
                onTogglePrivacy={togglePrivacy}
                onShare={onShare}
                onRemoveMember={removeMember}
                onDelete={deleteCollection}
              />
            ))}
            <form className="inline-form" onSubmit={addCollection}>
              <input
                className="step-input"
                placeholder="New collection name"
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className="add-btn" type="submit">
                + New Collection
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}