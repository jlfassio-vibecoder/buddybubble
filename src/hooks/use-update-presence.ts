'use client';

import { useEffect } from 'react';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import { getUserColor } from '@/lib/user-presence-colors';
import { usePresenceStore } from '@/store/presenceStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type UseUpdatePresenceOptions = {
  embedMode: boolean;
  workspaceId: string;
};

/**
 * Connects Supabase Realtime presence for the workspace, updates focus from `activeBubble`,
 * and disconnects on unmount. Skips all work when `embedMode` is true.
 */
export function useUpdatePresence({ embedMode, workspaceId }: UseUpdatePresenceOptions): void {
  const profile = useUserProfileStore((s) => s.profile);
  const activeBubble = useWorkspaceStore((s) => s.activeBubble);
  const presenceStatus = usePresenceStore((s) => s.status);
  const connect = usePresenceStore((s) => s.connect);
  const updateFocus = usePresenceStore((s) => s.updateFocus);
  const disconnect = usePresenceStore((s) => s.disconnect);

  useEffect(() => {
    if (embedMode) return;
    if (!workspaceId || !profile?.id) return;

    const name = profile.full_name?.trim() || profile.email?.split('@')[0] || 'Member';

    void connect(workspaceId, {
      user_id: profile.id,
      name,
      avatar_url: profile.avatar_url,
      color: getUserColor(profile.id),
      focus_type: 'workspace',
      focus_id: null,
    }).catch((err) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[presence] connect failed', err);
      }
    });

    return () => {
      void disconnect();
    };
  }, [
    embedMode,
    workspaceId,
    profile?.id,
    profile?.full_name,
    profile?.email,
    profile?.avatar_url,
    connect,
    disconnect,
  ]);

  useEffect(() => {
    if (embedMode) return;
    if (presenceStatus !== 'connected') return;

    if (!activeBubble || activeBubble.id === ALL_BUBBLES_BUBBLE_ID) {
      void updateFocus({ focus_type: 'workspace', focus_id: null });
      return;
    }
    void updateFocus({ focus_type: 'bubble', focus_id: activeBubble.id });
  }, [embedMode, presenceStatus, activeBubble?.id, updateFocus]);
}
