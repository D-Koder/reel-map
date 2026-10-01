import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { categories, feelings } from '../lib/constants';

export default function AddPlaceSheet({ collections, onAdd, onClose }) {
  const [reelUrl, setReelUrl] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('food');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');
  const [feeling, setFeeling] = useState('keen');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scrapedData, setScrapedData] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scrapeReel = async (url) => {
    if (!url.includes('instagram.com/reel/')) return;

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
    }
    setLoading(false);
  };

  const handleReelUrlChange = (e) => {
    const url = e.target.value;
    setReelUrl(url);
    if (url.includes('instagram.com/reel/')) {
      scrapeReel(url);
    }
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

        <label className="field">
          <span className="modal-label">Reel link (optional)</span>
          <input
            className="step-input"
            type="url"
            inputMode="url"
            value={reelUrl}
            onChange={handleReelUrlChange}
            placeholder="https://www.instagram.com/reel/…"
            disabled={loading}
          />
          {loading && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>🔄 Fetching reel info…</span>}
          {scrapedData && <span style={{ fontSize: '12px', color: '#2ecc71', marginTop: '4px' }}>✅ Reel info loaded</span>}
        </label>

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
