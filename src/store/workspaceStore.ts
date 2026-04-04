import { create } from 'zustand';
import { createClient } from '@utils/supabase/client';

export type WorkspaceRow = {
  id: string;
  name: string;
  category_type: 'business' | 'kids' | 'class';
  created_at: string;
  role: 'admin' | 'member' | 'guest';
};

type WorkspaceStore = {
  activeWorkspace: WorkspaceRow | null;
  userWorkspaces: WorkspaceRow[];
  loading: boolean;
  loadUserWorkspaces: () => Promise<void>;
  syncActiveFromRoute: (workspaceId: string) => Promise<void>;
  setActiveWorkspaceId: (id: string) => void;
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  activeWorkspace: null,
  userWorkspaces: [],
  loading: false,

  loadUserWorkspaces: async () => {
    set({ loading: true });
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ loading: false, userWorkspaces: [] });
      return;
    }

    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspaces(id, name, category_type, created_at)')
      .eq('user_id', user.id);

    if (error || !data) {
      set({ loading: false, userWorkspaces: [] });
      return;
    }

    const userWorkspaces: WorkspaceRow[] = data.flatMap((row) => {
      const w = row.workspaces;
      if (!w || Array.isArray(w)) return [];
      const ws = w as {
        id: string;
        name: string;
        category_type: string;
        created_at: string;
      };
      return [
        {
          id: ws.id,
          name: ws.name,
          category_type: ws.category_type as WorkspaceRow['category_type'],
          created_at: ws.created_at,
          role: row.role as WorkspaceRow['role'],
        },
      ];
    });

    set({ userWorkspaces, loading: false });
  },

  syncActiveFromRoute: async (workspaceId: string) => {
    const { userWorkspaces } = get();
    let list = userWorkspaces;
    if (!list.some((w) => w.id === workspaceId)) {
      await get().loadUserWorkspaces();
      list = get().userWorkspaces;
    }
    const active = list.find((w) => w.id === workspaceId) ?? null;
    set({ activeWorkspace: active });
  },

  setActiveWorkspaceId: (id: string) => {
    const active = get().userWorkspaces.find((w) => w.id === id) ?? get().activeWorkspace;
    if (active?.id === id) {
      set({ activeWorkspace: active });
      return;
    }
    const fallback = get().userWorkspaces.find((w) => w.id === id);
    set({ activeWorkspace: fallback ?? null });
  },
}));
