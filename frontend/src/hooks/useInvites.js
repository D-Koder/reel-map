import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useInvites(userId, showToast) {
  // Generate shareable invite link for a collection
  const generateInviteLink = useCallback(
    async (collectionId) => {
      try {
        // Create an invite record in the database
        const { data, error } = await supabase
          .from('collection_invites')
          .insert({
            collection_id: collectionId,
            created_by: userId,
            created_at: new Date().toISOString(),
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
        // Get the invite details
        const { data: invite, error: inviteError } = await supabase
          .from('collection_invites')
          .select('collection_id, expires_at')
          .eq('id', inviteCode)
          .single();

        if (inviteError || !invite) {
          showToast('❌ Invalid or expired invite link');
          return false;
        }

        // Check if expired
        if (new Date(invite.expires_at) < new Date()) {
          showToast('❌ This invite link has expired');
          return false;
        }

        // Check if already a member
        const { data: existing } = await supabase
          .from('collection_members')
          .select('id')
          .eq('collection_id', invite.collection_id)
          .eq('user_id', userId)
          .single();

        if (existing) {
          showToast('✅ You already have access to this collection');
          return true;
        }

        // Add user to collection as member
        const { error: addError } = await supabase
          .from('collection_members')
          .insert({
            collection_id: invite.collection_id,
            user_id: userId,
            role: 'member',
          });

        if (addError) throw addError;

        showToast('🎉 Successfully joined the collection!');
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
