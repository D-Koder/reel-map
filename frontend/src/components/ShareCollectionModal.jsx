import React, { useState } from 'react';
import { useInvites } from '../hooks/useInvites';

export default function ShareCollectionModal({ collection, userId, onClose, showToast }) {
  const { generateInviteLink } = useInvites(userId, showToast);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateLink = async () => {
    setLoading(true);
    const url = await generateInviteLink(collection.id);
    if (url) {
      setInviteUrl(url);
      // Copy to clipboard
      navigator.clipboard.writeText(url).catch(() => {
        showToast('Copied to clipboard!');
      });
    }
    setLoading(false);
  };

  const handleCopyLink = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      showToast('📋 Copied to clipboard!');
    }
  };

  const isOwner = collection.members.some((m) => m.role === 'owner' && m.id === userId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="modal-header">
          <div className="modal-title">Share "{collection.name}"</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ padding: '16px' }}>
          {/* Members Section */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#888780', marginBottom: '8px' }}>
              👥 MEMBERS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {collection.members.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    backgroundColor: '#f1efe8',
                    borderRadius: '6px',
                  }}
                >
                  <img
                    src={member.avatar}
                    alt={member.display_name}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{member.display_name}</div>
                    <div style={{ fontSize: '11px', color: '#888780' }}>
                      {member.role === 'owner' ? '👑 Owner' : 'Member'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate Link Section */}
          {isOwner && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#888780', marginBottom: '8px' }}>
                🔗 INVITE LINK
              </div>

              {inviteUrl ? (
                <div>
                  <div
                    style={{
                      backgroundColor: '#f1efe8',
                      borderRadius: '6px',
                      padding: '12px',
                      marginBottom: '8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      color: '#2c2c2a',
                    }}
                  >
                    {inviteUrl}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleCopyLink}
                      className="step-btn primary full-width"
                      style={{ flex: 1 }}
                    >
                      📋 Copy Link
                    </button>
                    <button
                      onClick={() => {
                        const mailtoUrl = `mailto:?subject=Join my "${collection.name}" collection on Reel Map&body=Click here to join: ${inviteUrl}`;
                        window.location.href = mailtoUrl;
                      }}
                      className="step-btn full-width"
                      style={{ flex: 1 }}
                    >
                      📧 Email
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGenerateLink}
                  disabled={loading}
                  className="step-btn primary full-width"
                >
                  {loading ? 'Generating…' : '✨ Generate Invite Link'}
                </button>
              )}
            </div>
          )}

          {/* Read-only message */}
          {!isOwner && (
            <div
              style={{
                backgroundColor: '#e8faf1',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '13px',
                color: '#2c2c2a',
              }}
            >
              Only the owner can share this collection. Ask {collection.members.find((m) => m.role === 'owner')?.display_name} to invite others.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
