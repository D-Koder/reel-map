import React, { useEffect, useState } from 'react';
import { Copy, Crown, Download, Eye, FileSpreadsheet, Link, Pencil, Users, X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { formatInviteCode, useInvites } from '../hooks/useInvites';
import { DEFAULT_AVATAR_URL } from '../lib/constants';
import { exportCollection } from '../lib/collectionFile';

async function copy(text, label, showToast) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${label}`);
  } catch {
    window.prompt(`Copy the ${label}:`, text);
  }
}

export default function ShareCollectionModal({ collection, userId, places = [], onSetRole, onClose, showToast }) {
  const sheetRef = React.useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);
  const { getInvite } = useInvites(userId, showToast);
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);

  const isOwner = collection.ownerId === userId || collection.members.some((m) => m.id === userId && m.role === 'owner');
  const [savingRole, setSavingRole] = useState(null); // member id

  const setRole = async (member, role) => {
    if (member.role === role || savingRole) return;
    setSavingRole(member.id);
    if (await onSetRole?.(member.id, role)) {
      showToast(`${member.display_name} is now ${role === 'editor' ? 'an editor' : 'a viewer'}`);
    }
    setSavingRole(null);
  };

  // Everyone in the collection can share it, so the code shows straight away; it's made (or reused) when Share opens.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvite(collection.id).then((result) => {
      if (cancelled) return;
      setInvite(result);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [collection.id, getInvite]);

  const exportAs = (format) => {
    if (!places.length) {
      showToast('Nothing to export yet');
      return;
    }
    exportCollection(collection, places, format);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={sheetRef} className="modal edit-sheet share-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" {...sheetDrag} />
        <div className="modal-header">
          <div className="modal-title">Share "{collection.name}"</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="share-body">
          <div className="invite-card">
            <div className="invite-card-label">Invite code</div>
            {loading ? (
              <div className="invite-code"><span className="spinner" aria-hidden="true" /></div>
            ) : invite ? (
              <>
                <div className="invite-code" aria-label={`Invite code ${invite.code.split('').join(' ')}`}>{formatInviteCode(invite.code)}</div>
                <div className="invite-card-hint">Friends enter this in Settings → Join a collection. Works for 30 days.</div>
                <div className="invite-actions">
                  <button type="button" className="step-btn primary invite-copy" onClick={() => copy(formatInviteCode(invite.code), 'code', showToast)}>
                    <Copy className="ico" aria-hidden="true" /> Copy code
                  </button>
                  <button type="button" className="step-btn secondary" onClick={() => copy(invite.url, 'link', showToast)}>
                    <Link className="ico" aria-hidden="true" /> Copy link
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="step-btn secondary full-width" onClick={() => {
                setLoading(true);
                getInvite(collection.id).then((result) => { setInvite(result); setLoading(false); });
              }}>
                Try again
              </button>
            )}
            <div className="invite-card-hint">New people join as viewers: they can vote and copy places, not change them.</div>
          </div>

          <div className="share-section">
            <div className="share-section-title">Export</div>
            <div className="share-list">
              <button type="button" className="share-row" onClick={() => exportAs('json')}>
                <span className="share-row-icon is-file"><Download aria-hidden="true" /></span>
                <span className="share-row-text">
                  <strong>Reel Map file</strong>
                  <span>Back up, or import into another account</span>
                </span>
                <span className="share-row-ext">.json</span>
              </button>
              <button type="button" className="share-row" onClick={() => exportAs('csv')}>
                <span className="share-row-icon is-sheet"><FileSpreadsheet aria-hidden="true" /></span>
                <span className="share-row-text">
                  <strong>Spreadsheet</strong>
                  <span>Names, addresses, notes, Maps and reel links</span>
                </span>
                <span className="share-row-ext">.csv</span>
              </button>
            </div>
            <p className="toggle-hint">Votes aren't included.</p>
          </div>

          <div className="share-section">
            <div className="share-section-title"><Users className="ico" aria-hidden="true" /> Members</div>
            <div className="share-members">
              {collection.members.map((member) => (
                <div className="share-member" key={member.id}>
                  <span className="share-member-avatar">
                    {member.avatar_url ? <img className="collection-member-avatar" src={member.avatar_url} alt="" /> : member.avatar === '🙂' ? <img className="collection-member-avatar" src={DEFAULT_AVATAR_URL} alt="" /> : member.avatar}
                  </span>
                  <span className="share-member-name">{member.display_name}</span>
                  {member.role === 'owner' ? (
                    <span className="share-member-role"><Crown className="ico" aria-hidden="true" /> Owner</span>
                  ) : isOwner ? (
                    // The owner picks what each member can do.
                    <span className="role-switch" role="group" aria-label={`${member.display_name}'s role`}>
                      {['viewer', 'editor'].map((role) => (
                        <button
                          key={role}
                          type="button"
                          className={`role-switch-option ${member.role === role ? 'is-on' : ''}`}
                          aria-pressed={member.role === role}
                          disabled={savingRole === member.id}
                          onClick={() => setRole(member, role)}
                        >
                          {role === 'editor' ? 'Editor' : 'Viewer'}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="share-member-role">
                      {member.role === 'editor'
                        ? <><Pencil className="ico" aria-hidden="true" /> Editor</>
                        : <><Eye className="ico" aria-hidden="true" /> Viewer</>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
