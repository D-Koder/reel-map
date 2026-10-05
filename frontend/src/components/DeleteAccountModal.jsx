import React, { useState } from 'react';

export default function DeleteAccountModal({ open, onClose, userId, collections, onTransferOwnership, onConfirmDelete, isDeleting }) {
  const ownedCollections = collections.filter(c => c.ownerId === userId);
  const [transfers, setTransfers] = useState({}); // collection.id -> new_owner_id
  const [cascadeDelete, setCascadeDelete] = useState(false);

  const handleTransfer = async (collectionId, newOwnerId) => {
    if (await onTransferOwnership(collectionId, newOwnerId)) {
      setTransfers(prev => ({ ...prev, [collectionId]: newOwnerId }));
    }
  };

  const handleDelete = async () => {
    const msg = cascadeDelete
      ? '⚠️ This will permanently delete your account AND all shared collections you own. This cannot be undone.'
      : '⚠️ This will permanently delete your account and all your data. Collections you own will become orphaned. This cannot be undone.';
    if (confirm(msg)) {
      await onConfirmDelete(cascadeDelete);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal delete-account-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span>Delete Account</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {ownedCollections.length === 0 ? (
            <>
              <p>Your account and all associated data will be permanently deleted.</p>
              <p className="warning">⚠️ This action cannot be undone.</p>
              <button
                className="step-btn danger full-width"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </>
          ) : (
            <>
              <p>You own {ownedCollections.length} collection{ownedCollections.length !== 1 ? 's' : ''}:</p>

              <div className="cascade-delete-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={cascadeDelete}
                    onChange={(e) => setCascadeDelete(e.target.checked)}
                    disabled={isDeleting}
                  />
                  <span>Delete all shared collections I own</span>
                </label>
                <p className="toggle-hint">
                  {cascadeDelete
                    ? '🗑️ All shared collections will be permanently deleted'
                    : '🔒 Collections will become orphaned (members can still view)'}
                </p>
              </div>

              {!cascadeDelete && (
                <div className="orphan-warning">
                  <p>If you delete your account without transferring ownership, these collections will become orphaned (no owner). Members can still view them, but no one can modify them.</p>
                </div>
              )}

              {!cascadeDelete && (
              <div className="collections-to-orphan">
                {ownedCollections.map(collection => {
                  const isTransferred = !!transfers[collection.id];
                  const otherMembers = collection.members.filter(m => m.role !== 'owner');

                  return (
                    <div key={collection.id} className={`orphan-item ${isTransferred ? 'transferred' : ''}`}>
                      <div className="orphan-collection-name">
                        {collection.emoji} {collection.name}
                      </div>
                      <div className="orphan-collection-members">
                        👥 {collection.members.length} member{collection.members.length !== 1 ? 's' : ''}
                      </div>

                      {isTransferred ? (
                        <div className="transfer-success">✓ Transferred</div>
                      ) : otherMembers.length > 0 ? (
                        <div className="transfer-options">
                          {otherMembers.map(member => (
                            <button
                              key={member.id}
                              className="transfer-btn"
                              onClick={() => handleTransfer(collection.id, member.id)}
                              disabled={isDeleting}
                            >
                              Give to {member.display_name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="no-members">No other members to transfer to</div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}

              <div className="modal-actions">
                <button className="step-btn secondary full-width" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="step-btn danger full-width"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : (cascadeDelete ? 'Delete Account & Collections' : 'Delete Account & Orphan Collections')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
