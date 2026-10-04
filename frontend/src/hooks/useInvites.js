import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useInvites(userId, showToast) {
  // Generate shareable invite link for a collection
  const generateInviteLink = useCallback(
    async (collectionId) => {
      try {
        // The insert policy only permits collection owners to create invites.
        const invite = {
          collection_id: collectionId,
          code: crypto.randomUUID(),
          invited_by: userId,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        let { data, error } = await supabase
          .from('collection_invites')
          .insert(invite)
          .select('id')
          .single();

        // Newer schemas use created_by and no longer include legacy code/invited_by.
        if (error && /(?:code|invited_by).*(?:column|schema cache)|column.*(?:code|invited_by)/i.test(error.message)) {
          ({ data, error } = await supabase
            .from('collection_invites')
            .insert({
              collection_id: collectionId,
              created_by: userId,
              expires_at: invite.expires_at,
            })
            .select('id')
            .single());
        }

        if (error) throw error;

        // Generate the shareable link
        const inviteCode = data.id;
        const inviteUrl = `${window.location.origin}?invite=${inviteCode}`;

        if (typeof showToast === 'function') showToast('✅ Invite link copied!');
        return inviteUrl;
      } catch (error) {
        console.error('Failed to generate invite:', error);
        if (typeof showToast === 'function') showToast(`❌ ${error.message}`);
        return null;
      }
    },
    [userId, showToast]
  );

  // Accept an invite and join the collection
  const acceptInvite = useCallback(
    async (inviteCode) => {
      try {
        const { data: joined, error } = await supabase.rpc('accept_collection_invite', {
          p_invite_id: inviteCode,
        });
        if (error) throw error;

        if (typeof showToast === 'function') {
          showToast(joined ? '🎉 Successfully joined the collection!' : '✅ You already have access to this collection');
        }
        return true;
      } catch (error) {
        console.error('Failed to accept invite:', error);
        if (typeof showToast === 'function') showToast(`❌ ${error.message}`);
        return false;
      }
    },
    [showToast]
  );

  return { generateInviteLink, acceptInvite };
}
