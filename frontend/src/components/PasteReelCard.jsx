import React, { useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { reelLinkFrom } from '../lib/reelLink';

// One tap saves the reel link you just copied. Reading the clipboard needs a tap (iPhone also asks
// "Allow Paste"), so this is a button, not something that runs on its own. If the phone won't let the app
// read it, a box appears to paste into.
// onPaste: the no-login demo's own action for the button, so it never reads the clipboard.
export default function PasteReelCard({ onSave, showToast, onPaste }) {
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');

  const save = (raw) => {
    const link = reelLinkFrom(raw);
    if (!link) {
      showToast("That doesn't look like an Instagram, TikTok or RedNote link.");
      return false;
    }
    onSave(link);
    setText('');
    setManual(false);
    return true;
  };

  const paste = async () => {
    try {
      const copied = await navigator.clipboard.readText();
      if (!copied.trim()) return showToast('Nothing copied yet. Copy a reel link first.');
      save(copied);
    } catch {
      setManual(true);
    }
  };

  return (
    <div className="paste-card">
      <button type="button" className="paste-btn" data-tour="paste" onClick={onPaste ?? paste}>
        <ClipboardPaste className="ico" aria-hidden="true" /> Paste a reel link
      </button>
      {manual && (
        <form className="paste-form" onSubmit={(e) => { e.preventDefault(); save(text); }}>
          <input
            className="paste-input"
            type="url"
            inputMode="url"
            placeholder="Paste the link here"
            aria-label="Reel link"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="inbox-action" disabled={!text.trim()}>Save</button>
        </form>
      )}
    </div>
  );
}
