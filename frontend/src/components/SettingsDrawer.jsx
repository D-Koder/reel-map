import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { AVATARS, DEFAULT_AVATAR_URL } from '../lib/constants';

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
              {isOwner ? 'Yours' : `Owned by ${owner?.display_name ?? 'someone'}`} · 👥 {collection.members.length}
            </span>
          </>
        )}
      </div>
      {isOwner && (
        <div className="collection-icons">
          <button className="collection-icon" onClick={() => setManaging((open) => !open)} title="Manage collection" aria-label="Manage collection" aria-expanded={managing}>
            ⚙️
          </button>
          <button
            className="collection-icon"
            onClick={() => onShare(collection)}
            title="Share collection"
            aria-label="Share"
          >
            🔗
          </button>
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
      <div className="settings-section-title">🙂 You</div>

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
            {uploading ? <><span className="spinner" aria-hidden="true" />Uploading photo…</> : '📸 Upload Profile Photo'}
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
          ✏️ Edit Profile
        </button>
      )}

      <div className="profile-actions">
        <button className="step-btn secondary full-width" onClick={() => supabase.auth.signOut()}>
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
    if (await onUpdateCollection(collection.id, { name })) showToast(`📝 Renamed to "${name}"`);
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
      showToast(makePrivate ? `🔒 Now private${removedNote}` : '🔓 Now shared');
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
          {profile && <ProfileSection key={profile.id} profile={profile} email={email} onUpdateProfile={onUpdateProfile} onDeleteClick={onOpenDeleteModal} />}

          <div className="settings-section">
            <div className="settings-section-title">📁 Collections</div>
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