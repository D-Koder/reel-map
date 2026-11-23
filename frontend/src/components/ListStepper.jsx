import React, { useEffect, useRef, useState } from 'react';

// Adding a list post's places one at a time. Each place is looked up when it comes up:
// a clear match is ready; otherwise the person searches (matches listed as they type) or types the address.
// Confirm & next keeps a place; Skip keeps it in Later and saves nothing. Nothing is saved until "Add".
//
// Props:
//   items         the post's listed places
//   lookupItem    (item) → { best, details } for the clear match, or { best: null }
//   searchFor     (query) → candidates from Google Maps
//   readDetails   (candidate, item) → the candidate's details (address, coordinates, hours...)
//   buildPlace    (item, details, typedLocation) → the place object the save takes
//   onSaveAll     (places) → saves the confirmed places
const SEARCH_PAUSE_MS = 800;

export default function ListStepper({ items, lookupItem, searchFor, readDetails, buildPlace, onSaveAll }) {
  // status: 'looking' | 'open' (needs a choice) | 'ready' (has a place) | 'confirmed' | 'later'
  const [rows, setRows] = useState(() => items.map((item) => ({ item, status: 'looking', place: null })));
  const [index, setIndex] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const update = (i, patch) => setRows((list) => list.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  // Look up the place that just came up.
  useEffect(() => {
    const row = rows[index];
    if (!row || row.status !== 'looking') return undefined;
    let alive = true;
    (async () => {
      const found = await lookupItem(row.item).catch(() => ({ best: null }));
      if (!alive || cancelled.current) return;
      if (found?.best) {
        const details = found.details || await readDetails(found.best, row.item).catch(() => null);
        if (!alive || cancelled.current) return;
        if (details) {
          update(index, { status: 'ready', place: buildPlace(row.item, details, '') });
          return;
        }
      }
      // Nothing clear: show the search with the place's own name as the first query.
      const first = `${row.item.name} ${row.item.area || row.item.address || ''}`.trim();
      setQuery(first);
      const found2 = await searchFor(first).catch(() => []);
      if (!alive || cancelled.current) return;
      setCandidates(found2);
      update(index, { status: 'open' });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, rows.length]);

  // Search as you type (after a pause): matches are listed; nothing is picked for the person.
  useEffect(() => {
    const row = rows[index];
    if (!row || row.status !== 'open' || query.trim().length < 4) return undefined;
    const timer = setTimeout(async () => {
      const found = await searchFor(query.trim()).catch(() => []);
      if (!cancelled.current) setCandidates(found);
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const nextFrom = (from) => {
    for (let i = from; i < rows.length; i += 1) {
      if (['looking', 'open', 'ready'].includes(rows[i].status)) return i;
    }
    return rows.length;
  };

  const goNext = (from) => {
    setCandidates([]);
    setQuery('');
    setIndex(nextFrom(from + 1));
  };

  const confirmCurrent = () => { update(index, { status: 'confirmed' }); goNext(index); };
  const skipCurrent = () => { update(index, { status: 'later' }); goNext(index); };

  const pickCandidate = async (candidate) => {
    setBusy(true);
    try {
      const details = await readDetails(candidate, rows[index].item);
      update(index, { status: 'ready', place: buildPlace(rows[index].item, details, '') });
    } catch {
      // The details could not be read: the person can pick another match or type the address.
    } finally {
      setBusy(false);
    }
  };

  const useTyped = () => {
    const typed = query.trim();
    if (typed.length < 5) return;
    update(index, { status: 'ready', place: buildPlace(rows[index].item, null, typed) });
  };

  const confirmed = rows.filter((row) => row.status === 'confirmed');
  const later = rows.filter((row) => row.status === 'later');
  const finished = index >= rows.length;

  const addConfirmed = async () => {
    setSaving(true);
    try {
      await onSaveAll(confirmed.map((row) => row.place));
    } finally {
      setSaving(false);
    }
  };

  const review = () => {
    const first = rows.findIndex((row) => row.status === 'later');
    if (first < 0) return;
    update(first, { status: 'looking' });
    setReviewing(true);
    setIndex(first);
  };

  if (finished) {
    return (
      <div className="stepper-card">
        <div className="stepper-summary">
          <div className="stepper-big">{confirmed.length} ready to add</div>
          <div className="stepper-small">
            {later.length ? `${later.length} left for later: ${later.map((row) => row.item.name).join(', ')}` : 'Every place is ready.'}
          </div>
        </div>
        <div className="stepper-nav">
          {later.length > 0 && !reviewing && <button type="button" className="stepper-btn" onClick={review}>Review later</button>}
          <button type="button" className="stepper-btn primary" onClick={addConfirmed} disabled={!confirmed.length || saving}>
            {saving ? 'Adding…' : `Add ${confirmed.length} place${confirmed.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    );
  }

  const row = rows[index];
  const done = rows.filter((r) => r.status === 'confirmed' || r.status === 'later').length;
  return (
    <div className="stepper-card">
      <div className="stepper-bar"><span style={{ width: `${(done / rows.length) * 100}%` }} /></div>
      <div className="stepper-label">Place {index + 1} of {rows.length} · {row.status === 'open' ? 'Needs a choice' : row.status === 'looking' ? 'Looking it up…' : 'Ready'}</div>
      <div className="stepper-place">
        <div className="stepper-name">{row.item.name}</div>
        <div className="stepper-sub">{row.item.address || row.item.area || ''}</div>

        {row.status === 'looking' && <div className="stepper-sub">Looking it up…</div>}

        {row.status === 'open' && (
          <div className="stepper-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the place or address"
              aria-label="Search the place or address"
              autoComplete="off"
            />
            {candidates.map((candidate, i) => (
              <button key={`${candidate.url || i}`} type="button" className="stepper-opt" onClick={() => pickCandidate(candidate)} disabled={busy}>
                <b>{candidate.name}</b><span>{candidate.address || ''}</span>
              </button>
            ))}
            {query.trim().length >= 5 && candidates.length === 0 && (
              <button type="button" className="stepper-opt" onClick={useTyped}>
                <b>Use “{query.trim()}”</b><span>The map pin will be approximate</span>
              </button>
            )}
          </div>
        )}

        {row.status === 'ready' && <div className="stepper-tag">✓ Ready</div>}
        {row.status === 'confirmed' && <div className="stepper-tag">✓ Confirmed</div>}
      </div>

      <div className="stepper-nav">
        <button type="button" className="stepper-btn" onClick={skipCurrent}>Skip for now</button>
        <button type="button" className="stepper-btn primary" onClick={confirmCurrent} disabled={row.status !== 'ready'}>Confirm &amp; next</button>
      </div>
      {later.length > 0 && <div className="stepper-later">Later ({later.length}): {later.map((r) => r.item.name).join(', ')}</div>}
    </div>
  );
}
