import { create } from 'zustand';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow } from '@/types/database';

/** One BuddyBubble the user belongs to (stored in `workspaces`). */
export type WorkspaceRow = {
  id: string;
  name: string;
  category_type: 'business' | 'kids' | 'class' | 'community' | 'fitness';
  created_at: string;
  role: 'admin' | 'member' | 'guest';
  /** Avatar in the far-left rail; optional until set in DB. */
  icon_url?: string | null;
  /** IANA timezone; drives task "today" and scheduled automation. */
  calendar_timezone?: string;
};

type WorkspaceStore = {
  activeWorkspace: WorkspaceRow | null;
  activeBubble: BubbleRow | null;
  userWorkspaces: WorkspaceRow[];
  loading: boolean;
  loadUserWorkspaces: () => Promise<void>;
  syncActiveFromRoute: (workspaceId: string) => Promise<void>;
  setActiveWorkspaceId: (id: string) => void;
  setActiveBubble: (bubble: BubbleRow | null) => void;
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  activeWorkspace: null,
  activeBubble: null,
  userWorkspaces: [],
  loading: false,

  setActiveBubble: (bubble) => set({ activeBubble: bubble }),

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

    // Two-step load avoids PostgREST embed quirks (nested `workspaces` occasionally null/array),
    // which previously dropped BuddyBubbles from the rail when `flatMap` rejected the shape.
    const { data: memberships, error: memError } = await supabase
      .from('workspace_members')
      .select('role, workspace_id')
      .eq('user_id', user.id);

    if (memError || !memberships?.length) {
      set({ loading: false, userWorkspaces: [] });
      return;
    }

    const roleByWorkspace = new Map(
      memberships.map((m) => [m.workspace_id, m.role as WorkspaceRow['role']]),
    );
    const workspaceIds = [...new Set(memberships.map((m) => m.workspace_id))];

    // Use `*` so PostgREST only returns columns that exist on the server. Listing `calendar_timezone`
    // explicitly 400s when the scheduled-dates migration is not applied yet (unknown column).
    const { data: workspaceRows, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .in('id', workspaceIds);

    if (wsError || !workspaceRows) {
      set({ loading: false, userWorkspaces: [] });
      return;
    }

    if (process.env.NODE_ENV === 'development' && workspaceRows.length < workspaceIds.length) {
      console.warn(
        '[workspaceStore] Fewer workspaces visible than memberships (check RLS or orphaned members):',
        { membershipIds: workspaceIds.length, visible: workspaceRows.length },
      );
    }

    const userWorkspaces: WorkspaceRow[] = workspaceRows.map((row) => {
      const ws = row as {
        id: string;
        name: string;
        category_type: string;
        created_at: string;
        icon_url?: string | null;
        calendar_timezone?: string | null;
      };
      return {
        id: ws.id,
        name: ws.name,
        category_type: ws.category_type as WorkspaceRow['category_type'],
        created_at: ws.created_at,
        icon_url: ws.icon_url ?? null,
        calendar_timezone: ws.calendar_timezone ?? 'UTC',
        role: roleByWorkspace.get(ws.id) ?? 'member',
      };
    });

    userWorkspaces.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

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
