import React, { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

// A look inside a collection from its invite link (?invite=<id>), before having an account.
// Only unlocked collections with a live invite show up (public.peek_collection_invite): names and
// addresses of places, never notes, votes, bookings or members. "Join" keeps the link and opens sign-in,
// and the app joins the collection once they are in.
export default function InvitePreview({ inviteId, onJoin, onClose }) {
  const [info, setInfo] = useState(undefined); // undefined = loading, null = locked, expired or gone

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('peek_collection_invite', { p_invite_id: inviteId }).then(({ data, error }) => {
      if (!cancelled) setInfo(error ? null : data ?? null);
    });
    return () => { cancelled = true; };
  }, [inviteId]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = info ? `${info.emoji ? `${info.emoji} ` : ''}${info.name}` : 'Shared collection';
  const hidden = info ? Math.max(0, (info.place_count ?? 0) - info.places.length) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </div>

        {info === undefined && <div className="center-screen"><span className="spinner" aria-hidden="true" />Loading…</div>}
        {info === null && (
          <>
            <p className="place-collection-note">This collection is locked or the link has expired. Ask the person who sent it for a new one.</p>
            <button type="button" className="step-btn primary full-width" onClick={onClose}>Continue</button>
          </>
        )}

        {info && (
          <div className="shared-place-body">
            <div className="shared-place-from">
              {info.owner_name ? `${info.owner_name} shared this with you` : 'Shared with you'} on waylit maps
            </div>
            {info.places.length === 0 && <p className="place-collection-note">No places yet. Join to add the first one.</p>}
            <ul className="invite-peek-list">
              {info.places.map((place) => (
                <li key={place.id} className="invite-peek-item">
                  <strong>{place.emoji ? `${place.emoji} ` : ''}{place.name}</strong>
                  {place.address && <span className="reel-suburb"><MapPin className="ico" aria-hidden="true" /> {place.address}</span>}
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="place-collection-note">+ {hidden} more after you join</p>}
            <div className="shared-place-save">
              <button type="button" className="step-btn primary full-width" onClick={onJoin}>Join to vote and add places</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
