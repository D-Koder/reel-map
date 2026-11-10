import React, { useState } from 'react';
import { Check, TriangleAlert, Users, X } from 'lucide-react';

export default function DeleteAccountModal({ open, onClose, userId, collections, onTransferOwnership, onConfirmDelete, isDeleting }) {
  const ownedCollections = collections.filter(c => c.ownerId === userId);
  const [transfers, setTransfers] = useState({}); // collection.id -> new_owner_id

  const handleTransfer = async (collectionId, newOwnerId) => {
    if (await onTransferOwnership(collectionId, newOwnerId)) {
      setTransfers(prev => ({ ...prev, [collectionId]: newOwnerId }));
    }
  };

  const handleDelete = async () => {
    const msg = ownedCollections.length
      ? 'This will permanently delete your account, your data, and the collections you own (other members lose them). This cannot be undone.'
      : 'This will permanently delete your account and all your data. This cannot be undone.';
    if (confirm(msg)) {
      await onConfirmDelete(true);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal delete-account-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span>Delete Account</span>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </div>

        <div className="modal-body">
          {ownedCollections.length === 0 ? (
            <>
              <p>Your account and all associated data will be permanently deleted.</p>
              <p className="warning"><TriangleAlert className="ico" aria-hidden="true" /> This action cannot be undone.</p>
              <button
                className="step-btn danger full-width"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <><span className="spinner" aria-hidden="true" />Deleting...</> : 'Delete My Account'}
              </button>
            </>
          ) : (
            <>
              <p>You own {ownedCollections.length} collection{ownedCollections.length !== 1 ? 's' : ''}:</p>

              <div className="orphan-warning">
                <p>Collections you own are deleted with your account, and other members lose them. To keep one, give it to another member first.</p>
              </div>

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
                        <Users className="ico" aria-hidden="true" /> {collection.members.length} member{collection.members.length !== 1 ? 's' : ''}
                      </div>

                      {isTransferred ? (
                        <div className="transfer-success"><Check className="ico" aria-hidden="true" /> Transferred</div>
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

              <div className="modal-actions">
                <button className="step-btn secondary full-width" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="step-btn danger full-width"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? <><span className="spinner" aria-hidden="true" />Deleting...</> : 'Delete account and my collections'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
