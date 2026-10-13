import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

const INVITE_DAYS = 30;
// No 0/O, 1/I/L, so a code read out loud or typed from a screenshot comes out right.
const CODE_LETTERS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 248 is the largest multiple of 31 under 256; bytes above it are rerolled so every letter is equally likely.
  return Array.from(bytes, (b) => {
    let n = b;
    while (n >= 248) n = crypto.getRandomValues(new Uint8Array(1))[0];
    return CODE_LETTERS[n % CODE_LETTERS.length];
  }).join('');
}

// "K7Q2XPMA" → "K7Q2-XPMA". Older invites have long codes, which are shown as they are.
export function formatInviteCode(code) {
  return code && code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

// The invite id from a pasted invite link (…?invite=<id>), else null.
export function inviteIdFromLink(text) {
  try {
    const id = new URL(String(text).trim()).searchParams.get('invite');
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

const isShortCode = (code) => typeof code === 'string' && code.length === CODE_LENGTH && /^[A-Z0-9]+$/.test(code);

export function useInvites(userId, showToast) {
  // An invite for a collection: { url, code }. Reuses my newest unexpired invite with a short code
  // (still a week or more to go), so opening Share again doesn't pile up invites.
  const getInvite = useCallback(
    async (collectionId) => {
      try {
        const { data: existing } = await supabase
          .from('collection_invites')
          .select('id, code, expires_at')
          .eq('collection_id', collectionId)
          .gt('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(5);
        const reusable = (existing ?? []).find((invite) => isShortCode(invite.code));
        if (reusable) {
          return { url: `${window.location.origin}?invite=${reusable.id}`, code: reusable.code };
        }

        // The insert policy only lets collection owners create invites.
        const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        let invite = null;
        let lastError = null;
        // A clash with an existing code is very unlikely; try a fresh one a couple of times.
        for (let attempt = 0; attempt < 3 && !invite; attempt += 1) {
          const code = makeCode();
          const { data, error } = await supabase
            .from('collection_invites')
            .insert({ collection_id: collectionId, code, invited_by: userId, created_by: userId, expires_at: expiresAt })
            .select('id, code')
            .single();
          if (!error) invite = data;
          else if (error.code !== '23505') { lastError = error; break; }
          else lastError = error;
        }

        // Databases without the invited_by column (the migrations' own schema) take created_by only.
        if (!invite && lastError && /invited_by.*(?:column|schema cache)|column.*invited_by/i.test(lastError.message)) {
          const code = makeCode();
          const { data, error } = await supabase
            .from('collection_invites')
            .insert({ collection_id: collectionId, code, created_by: userId, expires_at: expiresAt })
            .select('id, code')
            .single();
          if (error) throw error;
          invite = data;
        } else if (!invite) {
          throw lastError;
        }

        return { url: `${window.location.origin}?invite=${invite.id}`, code: invite.code };
      } catch (error) {
        console.error('Failed to make invite:', error);
        if (typeof showToast === 'function') showToast(`${error.message}`);
        return null;
      }
    },
    [userId, showToast]
  );

  // Accept an invite link and join the collection.
  const acceptInvite = useCallback(
    async (inviteCode) => {
      try {
        const { data: joined, error } = await supabase.rpc('accept_collection_invite', {
          p_invite_id: inviteCode,
        });
        if (error) throw error;

        if (typeof showToast === 'function') {
          showToast(joined ? 'Successfully joined the collection!' : 'You already have access to this collection');
        }
        return true;
      } catch (error) {
        console.error('Failed to accept invite:', error);
        if (typeof showToast === 'function') showToast(`${error.message}`);
        return false;
      }
    },
    [showToast]
  );

  // Join with a code typed in Settings, or a pasted invite link.
  // Returns { name, joined } on success, else { error }.
  const joinWithCode = useCallback(async (input) => {
    const linkId = inviteIdFromLink(input);
    if (linkId) {
      const { data: joined, error } = await supabase.rpc('accept_collection_invite', { p_invite_id: linkId });
      return error ? { error: error.message } : { name: null, joined: Boolean(joined) };
    }
    const { data, error } = await supabase.rpc('join_collection_by_code', { p_code: String(input || '') });
    if (error) {
      return {
        error: /function .*join_collection_by_code|schema cache/i.test(error.message)
          ? 'Joining with a code isn’t set up yet. Use the invite link for now.'
          : error.message,
      };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { name: row?.collection_name ?? null, joined: Boolean(row?.joined) };
  }, []);

  return { getInvite, acceptInvite, joinWithCode };
}
