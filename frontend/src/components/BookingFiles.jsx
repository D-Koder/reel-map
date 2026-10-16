import React, { useEffect, useState } from 'react';
import { FileText, Paperclip, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BUCKET = 'booking-files';
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

// Booking confirmations (screenshots or PDFs) for one collection's entry of a place.
// Everyone in the collection sees them; members who can edit can add more.
export default function BookingFiles({ place, canUpload, showToast }) {
  const folder = `${place.collection_id}/${place.id}`;
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  // The path of the file being replaced, while its new copy uploads.
  const [replacing, setReplacing] = useState(null);

  const load = async () => {
    if (!place.collection_id) return;
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
    if (error || !data?.length) {
      setFiles([]);
      return;
    }
    const paths = data.map((file) => `${folder}/${file.name}`);
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    setFiles(data.map((file, i) => ({
      path: paths[i],
      // Stored as "<time>-<name>": show the name the person chose.
      name: file.name.replace(/^\d+-/, ''),
      isImage: /^image\//.test(file.metadata?.mimetype || ''),
      url: signed?.[i]?.signedUrl || null,
    })));
  };

  useEffect(() => {
    load();
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Images or PDFs under 10 MB; tells the person when some were skipped.
  const allowed = (event) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    const ok = chosen.filter((file) => TYPES.includes(file.type) && file.size <= MAX_BYTES);
    if (ok.length < chosen.length) showToast('Only images or PDFs under 10 MB can be added.');
    return ok;
  };

  // The new file's path, or null when the upload failed.
  const put = async (file) => {
    const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'booking';
    const path = `${folder}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    return error ? null : path;
  };

  const upload = async (event) => {
    const ok = allowed(event);
    if (!ok.length) return;
    setUploading(true);
    let failed = 0;
    for (const file of ok) {
      if (!(await put(file))) failed += 1;
    }
    setUploading(false);
    showToast(failed ? `${failed} file${failed === 1 ? '' : 's'} couldn't be uploaded.` : 'Booking confirmation added');
    load();
  };

  // Swaps a file for a new one, e.g. after the booking changed. The new one is uploaded first, so a
  // failed upload keeps the old one. Only the uploader can remove the old one: for anyone else the
  // new copy is taken back out and nothing changes.
  const replace = async (old, event) => {
    const [file] = allowed(event);
    if (!file) return;
    setReplacing(old.path);
    const path = await put(file);
    if (!path) {
      setReplacing(null);
      showToast("The new file couldn't be uploaded.");
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).remove([old.path]);
    if (error || !data?.length) {
      await supabase.storage.from(BUCKET).remove([path]);
      showToast('Only the person who uploaded it can replace it.');
    } else {
      showToast('Booking confirmation replaced');
    }
    setReplacing(null);
    load();
  };

  const remove = async (file) => {
    const { data, error } = await supabase.storage.from(BUCKET).remove([file.path]);
    // Nothing removed and no error: someone else uploaded it.
    if (error || !data?.length) {
      showToast('Only the person who uploaded it can remove it.');
      return;
    }
    load();
  };

  // A place in no collection has nowhere to keep its files.
  if (!place.collection_id || (!canUpload && !files.length)) return null;

  return (
    <div className="booking-files">
      {files.length > 0 && (
        <ul className="booking-files-list">
          {files.map((file) => (
            <li key={file.path} className="booking-file">
              <a href={file.url || undefined} target="_blank" rel="noopener noreferrer" className="booking-file-link">
                {file.isImage && file.url
                  ? <img src={file.url} alt={file.name} className="booking-file-thumb" />
                  : <span className="booking-file-icon"><FileText className="ico" aria-hidden="true" /></span>}
                <span className="booking-file-name">{file.name}</span>
              </a>
              {canUpload && (
                <>
                  <label className={`booking-file-remove${replacing ? ' disabled' : ''}`} aria-label={`Replace ${file.name}`} title="Replace">
                    <input type="file" accept="image/*,application/pdf" hidden disabled={Boolean(replacing)} onChange={(event) => replace(file, event)} />
                    {replacing === file.path
                      ? <span className="spinner" aria-hidden="true" />
                      : <RefreshCw className="ico" aria-hidden="true" />}
                  </label>
                  <button type="button" className="booking-file-remove" onClick={() => remove(file)} aria-label={`Remove ${file.name}`} title="Remove">
                    <Trash2 className="ico" aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <label className={`step-btn secondary full-width booking-files-upload${uploading ? ' disabled' : ''}`}>
          <input type="file" accept="image/*,application/pdf" multiple hidden disabled={uploading} onChange={upload} />
          {uploading
            ? <><span className="spinner" aria-hidden="true" />Uploading…</>
            : <><Paperclip className="ico" aria-hidden="true" /> Upload booking confirmation</>}
        </label>
      )}
    </div>
  );
}
