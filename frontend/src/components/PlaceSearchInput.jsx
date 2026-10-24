import React, { useEffect, useRef, useState } from 'react';
import { MELBOURNE_CENTER } from '../lib/mapboxSearch';
import { CAN_SEARCH, retrievePlace, searchSuggestions } from '../lib/placeSearch';

// A text box that suggests places and addresses (Google when it's on, else Mapbox) as you type, like the map's search bar.
// Typing still works on its own: onChange gets the text, and onPick gets
// { name, address, lat, lng, category } when a suggestion is tapped.
// `near` ([lng, lat]) ranks suggestions around a spot, else the user's location, else Melbourne.
// `action` sits beside the box (Add's Verify button).
export default function PlaceSearchInput({ value, onChange, onPick, near = null, action = null, disabled = false, placeholder, ariaLabel, maxLength, autoFocus = false }) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(''); // '' | 'searching' | 'retrieving' | 'none' | 'error'
  const [bias, setBias] = useState(null);
  // Bumped when the box is tapped holding text filled in for the person, so that text is searched too.
  const [tapped, setTapped] = useState(0);
  // True while the text is what the person typed. Text filled in for them (a pick, a reel lookup,
  // the place being edited) doesn't open the list.
  const typedRef = useRef(false);
  const sessionRef = useRef(null);
  const locationRequestedRef = useRef(false);
  const origin = near ?? bias ?? MELBOURNE_CENTER;
  const boxRef = useRef(null);
  const open = results.length > 0 || status === 'none' || status === 'error';

  const close = () => {
    typedRef.current = false;
    setResults([]);
    setStatus('');
  };

  // A tap anywhere outside the box and its list closes the list, like Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!boxRef.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);

  // Asked once, when the box is first tapped, unless there's already a spot to search around.
  const requestUserLocation = () => {
    if (near || locationRequestedRef.current || !navigator.geolocation) return;
    locationRequestedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => setBias([position.coords.longitude, position.coords.latitude]),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  };

  // Suggestions wait 350ms after the last keystroke. Older requests are cancelled.
  useEffect(() => {
    const text = value.trim();
    if (!CAN_SEARCH || text.length < 3 || !typedRef.current) {
      setResults([]);
      setStatus('');
      return undefined;
    }
    sessionRef.current ??= crypto.randomUUID();
    const sessionToken = sessionRef.current;
    const controller = new AbortController();
    setStatus('searching');
    const timer = setTimeout(async () => {
      try {
        const found = await searchSuggestions(text, controller.signal, origin, sessionToken);
        setResults(found);
        setStatus(found.length ? '' : 'none');
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('error');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // origin is a new array each render; its numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tapped, origin[0], origin[1]]);

  const choose = async (result) => {
    const sessionToken = sessionRef.current ?? crypto.randomUUID();
    sessionRef.current = null;
    typedRef.current = false;
    setResults([]);
    setStatus('retrieving');
    try {
      const place = await retrievePlace(result.id, sessionToken, AbortSignal.timeout(10000), result.types);
      const picked = {
        ...place,
        name: place.name || result.name,
        address: place.address || result.address,
      };
      setStatus('');
      onPick(picked);
    } catch {
      setStatus('error');
    }
  };

  const input = (
    <input
      className="step-input"
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        typedRef.current = true;
        onChange(e.target.value);
      }}
      onFocus={() => {
        requestUserLocation();
        // Text from a reel lookup: show Mapbox's suggestions for it straight away.
        if (!typedRef.current && value.trim().length >= 3) {
          typedRef.current = true;
          setTapped((count) => count + 1);
        }
      }}
      onKeyDown={(e) => {
        // Enter picks the top suggestion instead of sending the form.
        if (e.key === 'Enter' && results[0]) {
          e.preventDefault();
          choose(results[0]);
        }
        if (e.key === 'Escape' && results.length) {
          e.stopPropagation();
          close();
        }
      }}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      autoComplete="off"
      autoFocus={autoFocus}
    />
  );

  // display: contents, so the wrapper only marks what counts as "inside" and leaves the layout alone.
  return (
    <div ref={boxRef} style={{ display: 'contents' }}>
      {action ? <div className="address-row">{input}{action}</div> : input}
      {(status === 'searching' || status === 'retrieving') && (
        <div className="map-search-results place-search-results" role="status" aria-label={status === 'searching' ? 'Searching' : 'Finding place'}>
          {[0, 1, 2].slice(0, status === 'searching' ? 3 : 1).map((i) => (
            <div key={i} className="map-search-result" aria-hidden="true">
              <span className="skeleton-bar" style={{ width: '70%' }} />
              <span className="skeleton-bar" style={{ width: '45%', height: '10px' }} />
            </div>
          ))}
        </div>
      )}
      {status === 'none' && <div className="map-search-note place-search-note">No matches. Try a different spelling.</div>}
      {status === 'error' && <div className="map-search-note place-search-note">Search is unavailable right now.</div>}
      {results.length > 0 && (
        <div className="map-search-results place-search-results" role="listbox" aria-label="Suggestions">
          {results.map((result) => (
            <button key={result.id} type="button" role="option" aria-selected="false" className="map-search-result" onClick={() => choose(result)}>
              <strong>{result.name}</strong>
              <span>{result.address}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
