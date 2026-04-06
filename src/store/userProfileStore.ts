import { create } from 'zustand';
import { createClient } from '@utils/supabase/client';
import type { Database } from '@/types/database';

export type UserProfileRow = Database['public']['Tables']['users']['Row'];

type UserProfileState = {
  profile: UserProfileRow | null;
  setProfile: (profile: UserProfileRow | null) => void;
  loadProfile: () => Promise<void>;
  reset: () => void;
};

export const useUserProfileStore = create<UserProfileState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  reset: () => set({ profile: null }),
  loadProfile: async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ profile: null });
      return;
    }
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('[userProfileStore] loadProfile', error);
      set({ profile: null });
      return;
    }
    set({ profile: data as UserProfileRow });
  },
}));
