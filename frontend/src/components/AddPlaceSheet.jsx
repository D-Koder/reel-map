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
  // Step management
  const [step, setStep] = useState('reel'); // 'reel' | 'details'

  // Step 1: Reel Link
  const [reelUrlInput, setReelUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 2: Place Details
  const [reelUrl, setReelUrl] = useState('');
  const [scrapedData, setScrapedData] = useState(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('food');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');
  const [feeling, setFeeling] = useState('keen');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scrapeReel = async (url) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-reel', {
        body: { reelUrl: url }
      });

      if (error) throw error;

      if (data?.success) {
        setScrapedData(data);
        setName(data.caption?.split('\n')[0].substring(0, 80) || '');
        setLocation(data.location || '');
      }
    } catch (error) {
      console.error('Scrape failed:', error.message);
      // Still proceed to details even if scrape fails
    }
    setLoading(false);
  };

  const handleConfirmReel = () => {
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

    // URL is valid, proceed to step 2
    setReelUrl(trimmedUrl);
    scrapeReel(trimmedUrl);
    setTimeout(() => setStep('details'), 300);
  };

  const handleSkipReel = () => {
    setReelUrl('');
    setScrapedData(null);
    setStep('details');
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
      <div
        className="modal edit-sheet"
        onClick={(e) => e.stopPropagation()}
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

        {/* STEP 1: Reel Link Input */}
        {step === 'reel' && (
          <div>
            <div className="field">
              <span className="modal-label">Reel link (optional)</span>
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
                disabled={loading}
                autoFocus
              />
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

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button
                type="button"
                className="step-btn full-width"
                onClick={handleSkipReel}
                disabled={loading}
              >
                Skip
              </button>
              <button
                type="button"
                className="step-btn primary full-width"
                onClick={handleConfirmReel}
                disabled={loading || !reelUrlInput.trim()}
              >
                {loading ? 'Loading…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Place Details */}
        {step === 'details' && (
          <form onSubmit={submit}>
            {/* Reel Thumbnail Preview */}
            {scrapedData && (
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--surface-muted)',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
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
                    {scrapedData.location || 'Location from reel'}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)'
                  }}>
                    ❤️ {(scrapedData.likes || 0).toLocaleString()} · 💬 {(scrapedData.comments || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* Name Field */}
            <label className="field">
              <span className="modal-label">Name *</span>
              <input
                className="step-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wine & Wild"
                maxLength={80}
                required
                disabled={saving}
              />
            </label>

            {/* Location Field */}
            <label className="field">
              <span className="modal-label">Location</span>
              <input
                className="step-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA"
                maxLength={100}
                disabled={saving}
              />
            </label>

            {/* Collection & Category */}
            <div className="field-row">
              <label className="field">
                <span className="modal-label">Collection</span>
                <select
                  className="step-input"
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  disabled={saving}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="modal-label">Category</span>
                <select
                  className="step-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={saving}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Vibe/Feeling */}
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
                    disabled={saving}
                  >
                    {f.emoji} <span className="segment-label">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className="step-btn primary full-width" disabled={saving || !name.trim()}>
              {saving ? 'Adding…' : 'Add place'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
