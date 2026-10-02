import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { categories, feelings } from '../lib/constants';

const isValidInstagramReelUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('instagram.com') && urlObj.pathname.includes('/reel/');
  } catch {
    return false;
  }
};

export default function AddPlaceSheet({ collections, onAdd, onClose }) {
  const [reelUrl, setReelUrl] = useState('');
  const [reelUrlInput, setReelUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('food');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');
  const [feeling, setFeeling] = useState('keen');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scrapedData, setScrapedData] = useState(null);
  const [urlValidated, setUrlValidated] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const validateAndConfirmUrl = () => {
    const trimmedUrl = reelUrlInput.trim();
    setUrlError('');

    if (!trimmedUrl) {
      setUrlError('Please paste an Instagram reel link');
      return;
    }

    if (!isValidInstagramReelUrl(trimmedUrl)) {
      setUrlError('Invalid Instagram reel link. Make sure it contains instagram.com/reel/');
      return;
    }

    // URL is valid, proceed to fetch
    setReelUrl(trimmedUrl);
    setUrlValidated(true);
    scrapeReel(trimmedUrl);
  };

  const scrapeReel = async (url) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-reel', {
        body: { reelUrl: url }
      });

      if (error) throw error;

      if (data?.success) {
        setScrapedData(data);
        if (data.caption && !name.trim()) {
          setName(data.caption.split('\n')[0].substring(0, 80));
        }
        if (data.location) {
          setLocation(data.location);
        }
      }
    } catch (error) {
      console.error('Scrape failed:', error.message);
      setUrlError('Failed to load reel. Check the link and try again.');
      setUrlValidated(false);
      setReelUrl('');
    }
    setLoading(false);
  };

  const handleResetReel = () => {
    setReelUrl('');
    setReelUrlInput('');
    setUrlError('');
    setUrlValidated(false);
    setScrapedData(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !collectionId) return;
    setSaving(true);
    await onAdd({
      name: name.trim(),
      location: location.trim(),
      category,
      collectionId,
      reelUrl: reelUrl.trim(),
      feeling
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal edit-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-label="Add a place"
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="modal-header">
          <div className="modal-title">Add a place</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* STEP 1: Reel URL Input & Validation */}
        <div className="field">
          <span className="modal-label">Reel link (optional)</span>
          <div style={{ display: 'flex', gap: '8px', marginBottom: urlError ? '4px' : '0' }}>
            <input
              className="step-input"
              type="url"
              inputMode="url"
              value={reelUrlInput}
              onChange={(e) => {
                setReelUrlInput(e.target.value);
                setUrlError('');
              }}
              placeholder="https://www.instagram.com/reel/…"
              disabled={loading || urlValidated}
              style={{ flex: 1 }}
            />
            {!urlValidated ? (
              <button
                type="button"
                className="step-btn primary"
                onClick={validateAndConfirmUrl}
                disabled={loading || !reelUrlInput.trim()}
              >
                {loading ? 'Loading…' : 'Confirm'}
              </button>
            ) : (
              <button
                type="button"
                className="step-btn"
                onClick={handleResetReel}
                disabled={loading}
              >
                Reset
              </button>
            )}
          </div>
          {urlError && (
            <span style={{ fontSize: '12px', color: '#e74c3c', marginTop: '4px', display: 'block' }}>
              ⚠️ {urlError}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              🔄 Fetching reel info…
            </span>
          )}
        </div>

        {/* STEP 2: Reel Preview with Skeleton Loading */}
        {urlValidated && (
          <div className="reel-preview" style={{
            padding: '12px',
            backgroundColor: 'var(--surface-muted)',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            {loading ? (
              // Skeleton Loading
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: 'var(--border)',
                  borderRadius: '6px',
                  animation: 'pulse 2s infinite'
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    height: '12px',
                    backgroundColor: 'var(--border)',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    width: '80%',
                    animation: 'pulse 2s infinite'
                  }} />
                  <div style={{
                    height: '10px',
                    backgroundColor: 'var(--border)',
                    borderRadius: '4px',
                    width: '60%',
                    animation: 'pulse 2s infinite'
                  }} />
                </div>
              </div>
            ) : scrapedData ? (
              // Loaded Data
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: 'var(--border)',
                  borderRadius: '6px',
                  flexShrink: 0,
                  backgroundImage: scrapedData.thumbnailUrl ? `url(${scrapedData.thumbnailUrl})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: 'var(--text)',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {scrapedData.location || 'Location not found'}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    gap: '12px'
                  }}>
                    <span>❤️ {(scrapedData.likes || 0).toLocaleString()}</span>
                    <span>💬 {(scrapedData.comments || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ) : (
              // Error/Empty State
              <div style={{
                textAlign: 'center',
                padding: '12px',
                color: 'var(--text-muted)',
                fontSize: '12px'
              }}>
                Failed to load reel data
              </div>
            )}
          </div>
        )}

        <label className="field">
          <span className="modal-label">Name *</span>
          <input
            className="step-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Wine & Wild"
            maxLength={80}
            required
            disabled={loading}
          />
        </label>

        <label className="field">
          <span className="modal-label">Location</span>
          <input
            className="step-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. San Francisco, CA"
            maxLength={100}
            disabled={loading}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="modal-label">Collection</span>
            <select className="step-input" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="modal-label">Category</span>
            <select className="step-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span className="modal-label">Your vibe</span>
          <div className="segmented wide" role="radiogroup" aria-label="Your vibe">
            {feelings.map((f) => (
              <button
                type="button"
                key={f.id}
                role="radio"
                aria-checked={feeling === f.id}
                className={`segment ${feeling === f.id ? 'selected' : ''}`}
                onClick={() => setFeeling(f.id)}
              >
                {f.emoji} <span className="segment-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="step-btn primary full-width" disabled={saving || loading}>
          {saving ? 'Adding…' : loading ? 'Loading…' : 'Add place'}
        </button>
      </form>
    </div>
  );
}
