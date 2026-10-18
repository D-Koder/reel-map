import React, { useEffect, useState } from 'react';
import { Instagram, MapPin, Navigation, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { googleMapsLink } from '../lib/places';
import ReelEmbedThumb, { reelEmbed } from './ReelEmbedThumb';
import PlaceThumb from './PlaceThumb';

// A place opened from a share link (?place=<id>). Anyone can see it: only the venue's public info
// is loaded (public.shared_place), never notes, votes, bookings or booking files.
// Signed out: "Sign in to save" keeps the link and opens the sign-in screen.
// Signed in: pick one of your collections and save it there.
export default function SharedPlaceSheet({ placeId, collections = [], signedIn, onSave, onSignIn, onClose }) {
  const [place, setPlace] = useState(undefined); // undefined = loading, null = not found
  const [target, setTarget] = useState(collections[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('shared_place', { pid: placeId }).then(({ data, error }) => {
      if (!cancelled) setPlace(error ? null : data ?? null);
    });
    return () => { cancelled = true; };
  }, [placeId]);

  useEffect(() => {
    if (!target && collections[0]) setTarget(collections[0].id);
  }, [collections, target]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    await onSave(target, place);
    setSaving(false);
  };

  const mapsLink = place ? googleMapsLink(place) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={place?.name ?? 'Shared place'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{place?.name ?? 'Shared place'}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </div>

        {place === undefined && <div className="center-screen"><span className="spinner" aria-hidden="true" />Loading…</div>}
        {place === null && <p className="place-collection-note">This place isn't available any more.</p>}

        {place && (
          <div className="shared-place-body">
            <div className="shared-place-from">Shared with you on waylit maps</div>
            {place.subtitle && <div className="venue-subtitle">{place.subtitle}</div>}
            {place.address && (
              <div className="reel-suburb"><MapPin className="ico" aria-hidden="true" /> {place.address}</div>
            )}
            {place.reel_url && (
              <div className="shared-place-thumb">
                {reelEmbed(place.reel_url)
                  ? <ReelEmbedThumb reelUrl={place.reel_url} className="reel-thumbnail-small" />
                  : <PlaceThumb place={place} className="reel-thumbnail-small" />}
              </div>
            )}
            <div className="shared-place-actions">
              {mapsLink && (
                <a className="step-btn secondary" href={mapsLink} target="_blank" rel="noopener noreferrer">
                  <Navigation className="ico" aria-hidden="true" /> Google Maps
                </a>
              )}
              {place.reel_url && (
                <a className="step-btn secondary" href={place.reel_url} target="_blank" rel="noopener noreferrer">
                  <Instagram className="ico" aria-hidden="true" /> Watch reel
                </a>
              )}
            </div>

            <div className="shared-place-save">
              {!signedIn ? (
                <button type="button" className="step-btn primary full-width" onClick={onSignIn}>
                  <Plus className="ico" aria-hidden="true" /> Sign in to save to my map
                </button>
              ) : collections.length === 0 ? (
                <p className="place-collection-note">Make a collection first, then open this link again to save it.</p>
              ) : (
                <>
                  <span className="modal-label">Save to my map</span>
                  <select className="step-input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={saving}>
                    {collections.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                  <button type="button" className="step-btn primary full-width" onClick={save} disabled={saving || !target}>
                    {saving ? <><span className="spinner" aria-hidden="true" />Saving…</> : <><Plus className="ico" aria-hidden="true" /> Save</>}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
