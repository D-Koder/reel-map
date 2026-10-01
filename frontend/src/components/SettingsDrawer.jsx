import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { AVATARS } from '../lib/constants';

function CollectionRow({ collection, isOwner, onRename, onTogglePrivacy }) {
  const [editing, setEditing] = useState(false);
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
              {isOwner ? 'Yours' : `Owned by ${owner?.display_name ?? 'someone'}`} · 👥 {collection.members.length}
            </span>
          </>
        )}
      </div>
      {isOwner && (
        <div className="collection-icons">
          <button
            className="collection-icon"
            onClick={() => onTogglePrivacy(collection)}
            title={collection.isPrivate ? 'Private — tap to share' : 'Shared — tap to make private'}
            aria-label={collection.isPrivate ? 'Make shared' : 'Make private'}
          >
            {collection.isPrivate ? '🔒' : '🔓'}
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileSection({ profile, email, onUpdateProfile }) {
  const [name, setName] = useState(profile.display_name);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  const saveName = () => {
    const next = name.trim();
    if (!next) setName(profile.display_name);
    else if (next !== profile.display_name) onUpdateProfile({ display_name: next });
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">🙂 You</div>
      <div className="profile-row">
        <button
          className="profile-avatar"
          onClick={() => setPickingAvatar((v) => !v)}
          aria-label="Change avatar"
          aria-expanded={pickingAvatar}
        >
          {profile.avatar}
        </button>
        <div className="profile-fields">
          <input
            className="step-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Your name"
          />
          <div className="profile-email">{email}</div>
        </div>
      </div>
      {pickingAvatar && (
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
      )}
      <button className="step-btn secondary full-width" onClick={() => supabase.auth.signOut()}>
        Log out
      </button>
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
  onUpdateProfile,
  showToast,
}) {
  const [newName, setNewName] = useState('');
  const [email, setEmail] = useState('');

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  const rename = async (collection, name) => {
    if (await onUpdateCollection(collection.id, { name })) showToast(`📝 Renamed to "${name}"`);
  };

  const togglePrivacy = async (collection) => {
    if (await onUpdateCollection(collection.id, { is_private: !collection.isPrivate })) {
      showToast(collection.isPrivate ? '🔓 Now shared' : '🔒 Now private');
    }
  };

  const addCollection = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await onCreateCollection(name)) {
      setNewName('');
      showToast(`✨ Added "${name}"`);
    }
  };

  return (
    <>
      <div className={`overlay-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`settings-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-content">
          {profile && <ProfileSection key={profile.id} profile={profile} email={email} onUpdateProfile={onUpdateProfile} />}

          <div className="settings-section">
            <div className="settings-section-title">📁 Collections</div>
            {collections.map((c) => (
              <CollectionRow
                key={`${c.id}-${c.name}`}
                collection={c}
                isOwner={c.ownerId === userId}
                onRename={rename}
                onTogglePrivacy={togglePrivacy}
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

          <div className="settings-section">
            <div className="settings-section-title">👥 Invite Partner / Friends</div>
            <div className="coming-soon">
              Invite codes, invite links and joining a collection are coming in the next update.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
