import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { categories, feelings } from '../lib/constants';
import { normalizeImageUrl } from '../lib/media';

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
  const [apiLogs, setApiLogs] = useState([]);

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

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setApiLogs(prev => [...prev, { message, type, timestamp }]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const scrapeReel = async (url) => {
    setLoading(true);
    setApiLogs([]);
    addLog('🔄 Starting to fetch reel data...', 'info');

    try {
      let data;
      let error;
      if (import.meta.env.PROD) {
        const response = await fetch('/api/scrape-reel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reelUrl: url }),
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok) error = new Error(data.error || `Scraper returned HTTP ${response.status}`);
      } else {
        ({ data, error } = await supabase.functions.invoke('scrape-reel', {
          body: { reelUrl: url }
        }));
      }

      if (error) {
        let detail = error.message;
        const response = error.context;
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json();
            detail = payload.error || payload.message || detail;
          } catch {
            // Keep the SDK error when the function response isn't JSON.
          }
        }
        addLog(`❌ API Error: ${detail}`, 'error');
        throw new Error(detail);
      }

      if (data?.success) {
        addLog(`✅ Successfully scraped reel data`, 'success');
        setScrapedData(data);
        setName(data.placeName || data.caption?.split('\n')[0].substring(0, 80) || '');
        setLocation(data.location || '');
        addLog(`📍 Location: ${data.location || 'Not found'}`, 'success');
        addLog(`❤️ Likes: ${data.likes || 0}`, 'success');
      } else {
        addLog(`⚠️ Response not successful: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error) {
      addLog(`❌ Scrape failed: ${error.message}`, 'error');
      console.error('Scrape error:', error);
    }
    setLoading(false);
  };

  const scrapeLocationFromCaption = async () => {
    if (!scrapedData?.caption) {
      console.warn('No caption to scrape location from');
      return;
    }

    addLog('🔍 Searching Google Maps with full caption...', 'info');
    setSaving(true);

    try {
      const response = await fetch('/api/scrape-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: scrapedData.caption,
          location: location || scrapedData.location
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addLog(`❌ Location search failed: ${data.error}`, 'error');
        throw new Error(data.error);
      }

      if (data.success) {
        if (data.mapsUrl) {
          addLog(`🔗 Maps searched: ${data.mapsUrl}`, 'info');
        }
        addLog(`📋 JSON Response: ${JSON.stringify(data)}`, 'info');
        addLog(`✅ Clicked first Google Maps result`, 'success');
        if (data.name) {
          addLog(`🏪 Restaurant/Place: ${data.name}`, 'success');
        }
        addLog(`📍 Address: ${data.address}`, 'success');
        if (data.hours) {
          addLog(`🕐 Hours: ${data.hours}`, 'success');
        }
        setLocation(data.address);
        if (data.latitude && data.longitude) {
          addLog(`🗺️ Coordinates: ${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`, 'success');
        }
      }
    } catch (error) {
      addLog(`❌ Could not fetch location: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
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
      reelThumbnailUrl: normalizeImageUrl(scrapedData?.thumbnailUrl),
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
            </div>

            {/* Loading State with Skeleton */}
            {loading && (
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--surface-muted)',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  🔄 Fetching reel info…
                </div>
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
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
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
                  backgroundImage: normalizeImageUrl(scrapedData.thumbnailUrl)
                    ? `url("${normalizeImageUrl(scrapedData.thumbnailUrl)}")`
                    : 'none',
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
                    {scrapedData.likes != null && `❤️ ${Number(scrapedData.likes).toLocaleString()}`}
                    {scrapedData.likes != null && scrapedData.comments != null && ' · '}
                    {scrapedData.comments != null && `💬 ${Number(scrapedData.comments).toLocaleString()}`}
                    {scrapedData.likes == null && scrapedData.comments == null && 'Counts unavailable'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(reelUrl, '_blank')}
                  title="Open reel"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '4px',
                    flexShrink: 0,
                    opacity: 0.7,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '1'}
                  onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                >
                  ↗️
                </button>
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="step-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA"
                  maxLength={100}
                  disabled={saving}
                  style={{ flex: 1 }}
                />
                {scrapedData?.caption && (
                  <button
                    type="button"
                    onClick={scrapeLocationFromCaption}
                    disabled={saving}
                    title="Auto-find location from caption using Google Maps"
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      whiteSpace: 'nowrap',
                      opacity: saving ? 0.6 : 1,
                      transition: 'opacity 0.2s'
                    }}
                  >
                    🔍 Find
                  </button>
                )}
              </div>
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

        {/* API Logs Console - Always Visible */}
        {apiLogs.length > 0 && (
          <div style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border)'
          }}>
            <div style={{
              fontSize: '11px',
              fontWeight: '500',
              color: 'var(--text-muted)',
              marginBottom: '8px'
            }}>
              API Logs
            </div>
            <div style={{
              padding: '10px',
              backgroundColor: '#1a1a1a',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '11px',
              maxHeight: '150px',
              overflowY: 'auto',
              overflowX: 'hidden',
              color: '#0f0'
            }}>
              {apiLogs.map((log, idx) => (
                <div key={idx} style={{
                  padding: '3px 0',
                  color: log.type === 'error' ? '#ff6b6b' : log.type === 'success' ? '#51cf66' : '#a0aec0',
                  borderBottom: '1px solid #2a2a2a',
                  lineHeight: '1.4',
                  wordBreak: 'break-all'
                }}>
                  <span style={{ color: '#888' }}>[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
