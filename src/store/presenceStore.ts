'use client';

import { create } from 'zustand';
import { createClient } from '@utils/supabase/client';
import { getUserColor } from '@/lib/user-presence-colors';

/** Holds the active Realtime channel (non-serializable; kept outside Zustand state). */
let presenceChannel: import('@supabase/supabase-js').RealtimeChannel | null = null;

export type UserPresence = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** Hex color for rings/borders */
  color: string;
  focus_type: 'workspace' | 'bubble' | 'task';
  focus_id: string | null;
};

type PresenceStatus = 'disconnected' | 'connecting' | 'connected';

function buildPresence(partial: Partial<UserPresence> & { user_id: string }): UserPresence {
  return {
    user_id: partial.user_id,
    name: (partial.name ?? 'Member').trim() || 'Member',
    avatar_url: partial.avatar_url ?? null,
    color: partial.color ?? getUserColor(partial.user_id),
    focus_type: partial.focus_type ?? 'workspace',
    focus_id: partial.focus_id ?? null,
  };
}

/**
 * Supabase presence state: keyed by presence key (we use user_id), values are payload stacks.
 */
function flattenPresenceState(state: Record<string, unknown[]>): Map<string, UserPresence> {
  const out = new Map<string, UserPresence>();
  for (const [key, stack] of Object.entries(state)) {
    if (!Array.isArray(stack) || stack.length === 0) continue;
    const raw = stack[stack.length - 1];
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Partial<UserPresence>;
    const uid = typeof p.user_id === 'string' ? p.user_id : key;
    if (uid) {
      out.set(key, buildPresence({ ...p, user_id: uid }));
    }
  }
  return out;
}

type PresenceStore = {
  status: PresenceStatus;
  /** Keyed by presence key (user_id). */
  users: Map<string, UserPresence>;
  localPresence: UserPresence | null;
  connect: (
    workspaceId: string,
    initialPayload: Partial<UserPresence> & { user_id: string },
  ) => Promise<void>;
  updateFocus: (focus: { focus_type: string; focus_id: string | null }) => Promise<void>;
  disconnect: () => Promise<void>;
};

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  status: 'disconnected',
  users: new Map(),
  localPresence: null,

  connect: async (workspaceId, initialPayload) => {
    await get().disconnect();
    set({ status: 'connecting' });

    const supabase = createClient();
    const userId = initialPayload.user_id;
    const topic = `presence:workspace:${workspaceId}`;

    const channel = supabase.channel(topic, {
      config: { presence: { key: userId } },
    });

    const applySync = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      set({ users: flattenPresenceState(state) });
    };

    channel.on('presence', { event: 'sync' }, applySync);
    channel.on('presence', { event: 'join' }, applySync);
    channel.on('presence', { event: 'leave' }, applySync);

    return new Promise<void>((resolve, reject) => {
      let subscribedOnce = false;
      channel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED' && !subscribedOnce) {
          subscribedOnce = true;
          try {
            const full = buildPresence(initialPayload);
            await channel.track(full);
            presenceChannel = channel;
            set({
              status: 'connected',
              localPresence: full,
            });
            applySync();
            resolve();
          } catch (e) {
            set({ status: 'disconnected', users: new Map(), localPresence: null });
            void supabase.removeChannel(channel);
            reject(e);
          }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !subscribedOnce) {
          subscribedOnce = true;
          set({ status: 'disconnected', users: new Map(), localPresence: null });
          reject(err ?? new Error(`Presence subscribe: ${status}`));
        }
      });
    });
  },

  updateFocus: async ({ focus_type, focus_id }) => {
    const ch = presenceChannel;
    const prev = get().localPresence;
    if (!ch || !prev) return;
    const next: UserPresence = {
      ...prev,
      focus_type: focus_type as UserPresence['focus_type'],
      focus_id,
    };
    await ch.track(next);
    set({ localPresence: next });
  },

  disconnect: async () => {
    const ch = presenceChannel;
    presenceChannel = null;
    if (ch) {
      const supabase = createClient();
      await supabase.removeChannel(ch);
    }
    set({
      status: 'disconnected',
      users: new Map(),
      localPresence: null,
    });
  },
}));
