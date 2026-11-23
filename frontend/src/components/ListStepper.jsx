import React, { useEffect, useRef, useState } from 'react';

// Adding a list post's places. First every place is searched (a few at a time). Places with a clear match are
// ready. Only the places that failed are shown one by one for the person to choose: pick a result, type the
// address, or skip (Later). Nothing is saved until "Add".
//
// Props:
//   items         the post's listed places
//   lookupItem    (item) → { best, details } for the clear match, or { best: null }
//   searchFor     (query) → candidates from Google Maps
//   readDetails   (candidate, item) → the candidate's details (address, coordinates, hours...)
//   buildPlace    (item, details, typedLocation) → the place object the save takes
//   onSaveAll     (places) → saves the places
const SEARCH_PAUSE_MS = 800;
const AT_ONCE = 3;

export default function ListStepper({ items, lookupItem, searchFor, readDetails, buildPlace, onSaveAll }) {
  // status: 'looking' | 'matched' (ready to add) | 'open' (needs a choice) | 'later' (skipped)
  const [rows, setRows] = useState(() => items.map((item) => ({ item, status: 'looking', place: null, candidates: [], query: '' })));
  const [current, setCurrent] = useState(-1);   // the open place being chosen
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const patch = (i, changes) => setRows((list) => list.map((row, j) => (j === i ? { ...row, ...changes } : row)));

  // 1. Search every place, a few at a time.
  useEffect(() => {
    let next = 0;
    const lookOne = async (i) => {
      const item = items[i];
      const found = await lookupItem(item).catch(() => ({ best: null }));
      let place = null;
      if (found?.best) {
        const details = found.details || await readDetails(found.best, item).catch(() => null);
        if (details) place = buildPlace(item, details, '');
      }
      if (!alive.current) return;
      if (place) {
        patch(i, { status: 'matched', place });
        return;
      }
      const first = `${item.name} ${item.area || item.address || ''}`.trim();
      const found2 = await searchFor(first).catch(() => []);
      if (!alive.current) return;
      patch(i, { status: 'open', candidates: found2, query: first });
    };
    const worker = async () => {
      while (alive.current && next < items.length) {
        const i = next;
        next += 1;
        await lookOne(i);
      }
    };
    Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searching = rows.some((row) => row.status === 'looking');
  const openIndex = rows.findIndex((row) => row.status === 'open');
  const shown = current >= 0 && rows[current]?.status === 'open' ? current : openIndex;

  // When the walker moves to a new place, its own search text comes up.
  useEffect(() => {
    if (shown >= 0) {
      setQuery(rows[shown].query);
      setCandidates(rows[shown].candidates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // Search as you type (after a pause): matches are listed for the person to choose. Nothing is picked here.
  useEffect(() => {
    if (shown < 0 || query.trim().length < 4 || query.trim() === rows[shown]?.query) return undefined;
    const timer = setTimeout(async () => {
      const found = await searchFor(query.trim()).catch(() => []);
      if (alive.current) setCandidates(found);
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pickCandidate = async (candidate) => {
    setBusy(true);
    try {
      const details = await readDetails(candidate, rows[shown].item);
      patch(shown, { status: 'matched', place: buildPlace(rows[shown].item, details, '') });
      setCurrent(-1);
    } catch {
      // The details could not be read: pick another match, or type the address.
    } finally {
      setBusy(false);
    }
  };

  const useTyped = () => {
    const typed = query.trim();
    if (typed.length < 5 || shown < 0) return;
    patch(shown, { status: 'matched', place: buildPlace(rows[shown].item, null, typed) });
    setCurrent(-1);
  };

  const skip = () => { if (shown >= 0) { patch(shown, { status: 'later' }); setCurrent(-1); } };

  const review = () => {
    const first = rows.findIndex((row) => row.status === 'later');
    if (first >= 0) { patch(first, { status: 'open' }); setCurrent(first); }
  };

  const matched = rows.filter((row) => row.status === 'matched');
  const later = rows.filter((row) => row.status === 'later');

  const addAll = async () => {
    setSaving(true);
    try {
      await onSaveAll(matched.map((row) => row.place));
    } finally {
      setSaving(false);
    }
  };

  const total = rows.length;
  const doneCount = matched.length + later.length;

  // Still searching: show progress only.
  if (searching) {
    return (
      <div className="stepper-card">
        <div className="stepper-bar"><span style={{ width: `${(doneCount / total) * 100}%` }} /></div>
        <div className="stepper-label">Searching {total} places… {total - rows.filter((r) => r.status === 'looking').length} of {total} done</div>
        <div className="stepper-place">
          {rows.map((row, i) => (
            <div key={`${i}-${row.item.name}`} className="stepper-line">
              <span>{row.item.name}</span>
              <span className="stepper-sub">{row.status === 'looking' ? 'Searching…' : row.status === 'matched' ? 'Found' : 'Needs a choice'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Nothing left to choose: the summary, with Add.
  if (shown < 0) {
    return (
      <div className="stepper-card">
        <div className="stepper-summary">
          <div className="stepper-big">{matched.length} ready to add</div>
          <div className="stepper-small">
            {later.length ? `${later.length} left for later: ${later.map((row) => row.item.name).join(', ')}` : 'Every place is ready.'}
          </div>
        </div>
        <div className="stepper-nav">
          {later.length > 0 && <button type="button" className="stepper-btn" onClick={review}>Review later</button>}
          <button type="button" className="stepper-btn primary" onClick={addAll} disabled={!matched.length || saving}>
            {saving ? 'Adding…' : `Add ${matched.length} place${matched.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    );
  }

  // Choosing: the places that failed, one at a time. Ready ones are listed above.
  const row = rows[shown];
  const openCount = rows.filter((r) => r.status === 'open').length;
  return (
    <div className="stepper-card">
      <div className="stepper-bar"><span style={{ width: `${(doneCount / total) * 100}%` }} /></div>
      <div className="stepper-label">{matched.length} ready · {openCount} to choose</div>
      <div className="stepper-place">
        <div className="stepper-name">{row.item.name}</div>
        <div className="stepper-sub">Google didn’t find this one. Search for it, or type the address.</div>
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
      </div>
      <div className="stepper-nav stepper-nav-one">
        <button type="button" className="stepper-btn" onClick={skip}>Skip for now</button>
      </div>
      {later.length > 0 && <div className="stepper-later">Later ({later.length}): {later.map((r) => r.item.name).join(', ')}</div>}
    </div>
  );
}
