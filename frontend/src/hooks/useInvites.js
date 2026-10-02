import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useInvites(userId, showToast) {
  // Generate shareable invite link for a collection
  const generateInviteLink = useCallback(
    async (collectionId) => {
      try {
        // The insert policy only permits collection owners to create invites.
        const { data, error } = await supabase
          .from('collection_invites')
          .insert({
            collection_id: collectionId,
            created_by: userId,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          })
          .select('id')
          .single();

        if (error) throw error;

        // Generate the shareable link
        const inviteCode = data.id;
        const inviteUrl = `${window.location.origin}?invite=${inviteCode}`;

        showToast('✅ Invite link copied!');
        return inviteUrl;
      } catch (error) {
        console.error('Failed to generate invite:', error);
        showToast(`❌ ${error.message}`);
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

        showToast(joined ? '🎉 Successfully joined the collection!' : '✅ You already have access to this collection');
        return true;
      } catch (error) {
        console.error('Failed to accept invite:', error);
        showToast(`❌ ${error.message}`);
        return false;
      }
    },
    [userId, showToast]
  );

  return { generateInviteLink, acceptInvite };
}
