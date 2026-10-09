import React, { useEffect, useState } from 'react';
import { categories, feelings } from '../lib/constants';
import { postStream } from '../lib/streamApi';
import { normalizeImageUrl } from '../lib/media';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const isValidInstagramUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('instagram.com') && (urlObj.pathname.includes('/reel/') || urlObj.pathname.includes('/p/'));
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
  const [mapsData, setMapsData] = useState(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('food');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');
  const [feeling, setFeeling] = useState('keen');
  const [saving, setSaving] = useState(false);
  const [locationCandidates, setLocationCandidates] = useState([]);
  const [locationSearchDone, setLocationSearchDone] = useState(false);
  const [loadingCandidateUrl, setLoadingCandidateUrl] = useState(null);
  const [verifyResults, setVerifyResults] = useState(null);
  const [verifyCandidate, setVerifyCandidate] = useState(null);
  const [verifyingLocation, setVerifyingLocation] = useState(false);

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
    addLog('🔄 Starting to fetch Instagram data...', 'info');

    try {
      let data;
      try {
        data = await postStream('/api/enrich-reel', { reelUrl: url }, {
          onStep: (message) => addLog(`🔎 ${message}`),
          timeoutMs: 90000,
        });
      } catch (error) {
        addLog(`❌ API Error: ${error.message}`, 'error');
        throw error;
      }

      if (data?.success) {
        addLog(`✅ Successfully scraped reel data`, 'success');
        setScrapedData(data);
        setName(data.placeName || data.caption?.split('\n')[0].substring(0, 80) || '');
        setLocation(data.location || '');
        addLog(`📍 Location: ${data.location || 'Not found'}`, 'success');
        addLog(`❤️ Likes: ${data.likes || 0}`, 'success');
        if (data.maps) {
          const candidates = (data.maps.candidates || []).map((candidate) => ({ ...candidate, searchQuery: data.maps.query }));
          if (data.maps.details) {
            setMapsData(data.maps.details);
            setName(data.maps.details.name || data.placeName || name);
            setLocation(data.maps.details.address || data.location || '');
            addLog(`✅ Google Maps matched ${data.maps.details.name}.`, 'success');
            addLog(`📍 Address: ${data.maps.details.address || 'Not listed'}`, 'success');
          } else if (candidates.length) {
            setLocationCandidates(candidates);
            setLocationSearchDone(true);
            addLog(`🔍 Searched with: "${data.maps.query}"`, 'info');
            addLog(`🔎 Found ${candidates.length} Google Maps match${candidates.length === 1 ? '' : 'es'}; choose the right place below.`, 'success');
          } else if (data.maps.error) {
            addLog(`⚠️ Google Maps: ${data.maps.error}`, 'error');
          }
        }
      } else {
        addLog(`⚠️ Response not successful: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error) {
      addLog(`❌ Scrape failed: ${error.message}`, 'error');
      console.error('Scrape error:', error);
    }
    setLoading(false);
  };

  const requestLocationApi = (payload) => postStream('/api/scrape-location', payload, {
    onStep: (message) => addLog(`🔎 ${message}`),
    timeoutMs: 55000,
  });

  const selectLocationCandidate = async (candidate, preserveName = false) => {
    setLoadingCandidateUrl(candidate.url);
    try {
      const data = await requestLocationApi({
        action: 'details',
        query: candidate.searchQuery,
        placeUrl: candidate.url,
        placeAddress: candidate.address,
        placeName: candidate.name,
        location: candidate.address || location || scrapedData?.location || '',
      });
      setMapsData(data);
      if (!preserveName || !name.trim()) setName(data.name || candidate.name);
      setLocation(data.address || candidate.address || location);
      setLocationCandidates([]);
      setLocationSearchDone(false);
      setVerifyResults(null);
      setVerifyCandidate(null);
      addLog(`✅ Selected ${data.name}; scraped its place details.`, 'success');
      addLog(`📍 Address: ${data.address || 'Not listed'}`, 'success');
      addLog(`🗺️ Google Maps: ${data.mapsUrl || candidate.url}`, 'success');
    } catch (error) {
      addLog(`❌ Could not fetch selected place: ${error.message}`, 'error');
    } finally {
      setLoadingCandidateUrl(null);
    }
  };

  const verifyLocation = async () => {
    const query = location.trim();
    if (!query) return;
    setVerifyingLocation(true);
    setVerifyCandidate(null);
    setVerifyResults([]);
    try {
      const data = await requestLocationApi({ action: 'search', query, location: query });
      setVerifyResults(data.candidates || []);
      if (data.candidates?.length === 1) setVerifyCandidate(data.candidates[0]);
    } catch (error) {
      addLog(`❌ Could not verify address: ${error.message}`, 'error');
    } finally {
      setVerifyingLocation(false);
    }
  };

  const handleConfirmReel = () => {
    const trimmedUrl = reelUrlInput.trim();
    setUrlError('');

    if (!trimmedUrl) {
      setUrlError('Please paste an Instagram link');
      return;
    }

    if (!isValidInstagramUrl(trimmedUrl)) {
      setUrlError('Invalid Instagram link. Make sure it contains instagram.com/reel/ or instagram.com/p/');
      return;
    }

    // URL is valid, proceed to step 2
    setReelUrl(trimmedUrl);
    setMapsData(null);
    scrapeReel(trimmedUrl);
    setTimeout(() => setStep('details'), 300);
  };

  const handleSkipReel = () => {
    setReelUrl('');
    setScrapedData(null);
    setMapsData(null);
    setStep('details');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !collectionId) return;
    setSaving(true);

    try {
      let venueDetails = mapsData;
      if (location.trim() && (!Number.isFinite(venueDetails?.latitude) || !Number.isFinite(venueDetails?.longitude))) {
        if (!MAPBOX_TOKEN) {
          addLog('⚠️ Mapbox token is missing; saved address will not have a map pin.', 'error');
        } else {
          addLog(`📍 Finding map coordinates for: ${name.trim()}, ${location.trim()}`, 'info');
          try {
            const query = [name.trim(), location.trim()].filter(Boolean).join(', ');
            const geocodeUrl = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
            geocodeUrl.searchParams.set('access_token', MAPBOX_TOKEN);
            geocodeUrl.searchParams.set('limit', '1');
            geocodeUrl.searchParams.set('types', 'address,poi');
            const response = await fetch(geocodeUrl, { signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error(`Mapbox geocoding returned HTTP ${response.status}`);

            const result = await response.json();
            const feature = result.features?.[0];
            if (feature?.center?.length === 2) {
              venueDetails = {
                ...venueDetails,
                latitude: feature.center[1],
                longitude: feature.center[0],
                address: venueDetails?.address || location.trim(),
                name: venueDetails?.name || name.trim(),
                source: 'mapbox',
              };
              addLog(`✅ Coordinates: ${feature.center[1].toFixed(5)}, ${feature.center[0].toFixed(5)} (${feature.place_name || feature.text || 'Mapbox result'})`, 'success');
            } else {
              addLog('⚠️ No coordinates found. Place will save without a map pin; add a full street address and try again.', 'error');
            }
          } catch (error) {
            addLog(`⚠️ Address geocoding failed: ${error.message}. Place will save without a map pin.`, 'error');
          }
        }
      }

      addLog('💾 Saving place…', 'info');
      const collectionName = collections.find((c) => c.id === collectionId)?.name ?? collectionId;
      addLog(`🧾 Saving to "${collectionName}": ${JSON.stringify({
        name: name.trim(),
        category,
        address: location.trim() || null,
        lat: venueDetails?.latitude ?? null,
        lng: venueDetails?.longitude ?? null,
        phone: venueDetails?.phone ?? null,
        bookingUrl: venueDetails?.bookingUrl ?? null,
        hours: venueDetails?.hours?.length ? venueDetails.hours : null,
        reelUrl: reelUrl.trim() || null,
        thumbnailUrl: normalizeImageUrl(scrapedData?.thumbnailUrl) || null,
        source: venueDetails?.source || (venueDetails ? 'google_maps' : 'manual'),
        vibe: feeling,
      })}`, 'info');
      await onAdd({
        name: name.trim(),
        location: location.trim(),
        category,
        collectionId,
        reelUrl: reelUrl.trim(),
        reelThumbnailUrl: normalizeImageUrl(scrapedData?.thumbnailUrl),
        venueDetails,
        feeling
      });
    } catch (error) {
      addLog(`❌ Could not save place: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
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
              <span className="modal-label">Instagram link (optional)</span>
              <input
                className="step-input"
                type="url"
                inputMode="url"
                value={reelUrlInput}
                onChange={(e) => {
                  setReelUrlInput(e.target.value);
                  setUrlError('');
                }}
                placeholder="https://www.instagram.com/reel/… or /p/…"
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
                  🔄 Fetching Instagram data…
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
                <button
                  type="button"
                  aria-label="Open reel"
                  onClick={() => window.open(reelUrl, '_blank', 'noopener,noreferrer')}
                  style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: 'var(--border)',
                  borderRadius: '6px',
                  flexShrink: 0,
                  border: 0,
                  padding: 0,
                  cursor: reelUrl ? 'pointer' : 'default',
                  backgroundImage: normalizeImageUrl(scrapedData.thumbnailUrl)
                    ? `url("${normalizeImageUrl(scrapedData.thumbnailUrl)}")`
                    : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                  }}
                  disabled={!reelUrl}
                />
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
                  onClick={() => {
                    const query = [name || scrapedData.placeName, location || scrapedData.location].filter(Boolean).join(' ');
                    const mapsUrl = mapsData?.mapsUrl || `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
                    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                  }}
                  title="Open Google Maps location"
                  aria-label="Open Google Maps location"
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
                onChange={(e) => {
                  setName(e.target.value);
                  setMapsData(null);
                  setLocationCandidates([]);
                  setLocationSearchDone(false);
                }}
                placeholder="e.g. Wine & Wild"
                maxLength={80}
                required
                disabled={saving}
              />
            </label>

            {/* Location Field */}
            <label className="field">
              <span className="modal-label">Address · used for map pin</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="step-input"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setMapsData(null);
                    setLocationCandidates([]);
                    setLocationSearchDone(false);
                  }}
                  placeholder="Street address, suburb, city"
                  maxLength={100}
                  disabled={saving}
                  style={{ flex: 1 }}
                />
              </div>
              {!reelUrl && (
                <button
                  type="button"
                  className="step-btn secondary"
                  onClick={verifyLocation}
                  disabled={saving || verifyingLocation || !location.trim() || !!loadingCandidateUrl}
                  style={{ marginTop: '8px' }}
                >
                  {verifyingLocation ? 'Searching Google Maps…' : 'Verify location'}
                </button>
              )}
            </label>

            {locationCandidates.length > 0 && (
              <div role="group" aria-label="Google Maps matches" style={{ margin: '-8px 0 16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Choose the right place ({locationCandidates.length} found):
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {locationCandidates.map((candidate) => (
                    <button
                      key={candidate.url}
                      type="button"
                      onClick={() => selectLocationCandidate(candidate)}
                      disabled={saving || !!loadingCandidateUrl}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        textAlign: 'left',
                        cursor: loadingCandidateUrl ? 'wait' : 'pointer',
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: '14px' }}>
                        {loadingCandidateUrl === candidate.url ? 'Loading details…' : candidate.name}
                      </strong>
                      <span style={{ display: 'block', marginTop: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {[candidate.address, candidate.category, candidate.rating && `★ ${candidate.rating}`]
                          .filter(Boolean).join(' · ') || candidate.summary || 'Google Maps place'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {locationSearchDone && locationCandidates.length === 0 && (
              <div role="status" style={{ margin: '-8px 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                No matches. Try editing the address or enter place details manually.
              </div>
            )}

            {verifyResults && (
              <div className="modal-overlay location-verify-overlay" onClick={(e) => { e.stopPropagation(); setVerifyResults(null); }}>
                <div className="modal location-verify-modal" role="dialog" aria-label="Verify location" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <div className="modal-title">Confirm location</div>
                    <button type="button" className="modal-close" onClick={() => setVerifyResults(null)} aria-label="Close">✕</button>
                  </div>
                  {verifyResults.length ? (
                    <>
                      <p className="modal-label">Choose the matching Google Maps place.</p>
                      <div className="location-verify-results">
                        {verifyResults.map((candidate) => (
                          <button
                            key={candidate.url}
                            type="button"
                            className={`location-verify-result ${verifyCandidate?.url === candidate.url ? 'selected' : ''}`}
                            onClick={() => setVerifyCandidate(candidate)}
                          >
                            <strong>{candidate.name}</strong>
                            <span>{candidate.address || candidate.summary || 'Address not listed'}</span>
                          </button>
                        ))}
                      </div>
                      <div className="field-row">
                        <button type="button" className="step-btn secondary full-width" onClick={() => setVerifyResults(null)}>Cancel</button>
                        <button
                          type="button"
                          className="step-btn primary full-width"
                          disabled={!verifyCandidate || !!loadingCandidateUrl}
                          onClick={() => selectLocationCandidate({ ...verifyCandidate, searchQuery: location.trim() }, true)}
                        >
                          {loadingCandidateUrl ? 'Loading details…' : 'Confirm place'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>No Google Maps matches. Check the address and try again.</p>
                      <button type="button" className="step-btn secondary full-width" onClick={() => setVerifyResults(null)}>Close</button>
                    </>
                  )}
                </div>
              </div>
            )}

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
