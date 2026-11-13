import React, { useState } from 'react';
import { Check, Send, UserPlus, Users, X } from 'lucide-react';
import { useFriends } from '../hooks/useFriends';
import { peopleYouKnow } from '../lib/friends';
import Avatar from './Avatar';

// One person in a list, with the buttons that fit (passed as children).
function Person({ person, note, children }) {
  return (
    <div className="share-member">
      <Avatar person={person} className="share-member-avatar" />
      <span className="share-member-name">{person.display_name}{note && <small className="friend-note"> {note}</small>}</span>
      <span className="friend-actions">{children}</span>
    </div>
  );
}

// Settings: my friends, requests, people I could add, and my friend link. Friends can be added to a collection
// in one tap from Share.
export default function FriendsSection({ userId, collections, showToast }) {
  const f = useFriends(userId, showToast);
  const [busy, setBusy] = useState(null);
  const act = async (id, fn) => { setBusy(id); await fn(); setBusy(null); };
  const related = f.rows.map((r) => r.id);
  const suggestions = peopleYouKnow(collections, userId, related);

  return (
    <div className="settings-section" data-tour="friends">
      <div className="settings-section-title"><Users className="ico" aria-hidden="true" /> Friends</div>

      <button type="button" className="step-btn primary full-width" onClick={f.shareLink}>
        <Send className="ico" aria-hidden="true" /> Invite a friend with a link
      </button>
      <p className="toggle-hint">Anyone who opens your link becomes your friend. Friends can be added to your collections in one tap.</p>

      {f.incoming.length > 0 && (
        <div className="share-members">
          <div className="join-label">Wants to be your friend</div>
          {f.incoming.map((p) => (
            <Person key={p.id} person={p}>
              <button type="button" className="step-btn primary" disabled={busy === p.id} onClick={() => act(p.id, () => f.accept(p))}><Check className="ico" aria-hidden="true" /> Accept</button>
              <button type="button" className="role-switch-remove" aria-label={`Decline ${p.display_name}`} disabled={busy === p.id} onClick={() => act(p.id, () => f.decline(p))}><X aria-hidden="true" /></button>
            </Person>
          ))}
        </div>
      )}

      <div className="share-members">
        {f.friends.length > 0 && <div className="join-label">Your friends</div>}
        {f.friends.map((p) => (
          <Person key={p.id} person={p}>
            <button type="button" className="role-switch-remove" aria-label={`Remove ${p.display_name} from friends`} disabled={busy === p.id}
              onClick={() => window.confirm(`Remove ${p.display_name} from your friends? They stay in any collections they've joined.`) && act(p.id, () => f.remove(p))}><X aria-hidden="true" /></button>
          </Person>
        ))}
        {!f.loading && f.friends.length === 0 && f.incoming.length === 0 && <p className="toggle-hint">No friends yet. Send your link, or add someone you already share a collection with.</p>}
      </div>

      {f.outgoing.length > 0 && (
        <div className="share-members">
          <div className="join-label">Waiting for them to accept</div>
          {f.outgoing.map((p) => (
            <Person key={p.id} person={p} note="Requested">
              <button type="button" className="step-btn secondary" disabled={busy === p.id} onClick={() => act(p.id, () => f.remove(p))}>Cancel</button>
            </Person>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="share-members">
          <div className="join-label">People in your collections</div>
          {suggestions.map((p) => (
            <Person key={p.id} person={p}>
              <button type="button" className="step-btn secondary" disabled={busy === p.id} onClick={() => act(p.id, () => f.request(p))}><UserPlus className="ico" aria-hidden="true" /> Add friend</button>
            </Person>
          ))}
        </div>
      )}
    </div>
  );
}
