'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow } from '@/types/database';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { WorkspaceRail } from './workspace-rail';
import { BubbleSidebar } from './bubble-sidebar';
import { ChatPane } from './chat-pane';
import { KanbanPane } from './kanban-pane';

type Props = {
  workspaceId: string;
  initialRole: 'admin' | 'member' | 'guest';
  children: React.ReactNode;
};

export function DashboardShell({ workspaceId, initialRole, children }: Props) {
  const loadUserWorkspaces = useWorkspaceStore((s) => s.loadUserWorkspaces);
  const syncActiveFromRoute = useWorkspaceStore((s) => s.syncActiveFromRoute);
  const [bubbles, setBubbles] = useState<BubbleRow[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);

  const canWrite = initialRole !== 'guest';

  useEffect(() => {
    void loadUserWorkspaces();
    void syncActiveFromRoute(workspaceId);
  }, [workspaceId, loadUserWorkspaces, syncActiveFromRoute]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from('bubbles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });
      const rows = (data ?? []) as BubbleRow[];
      setBubbles(rows);
      setSelectedBubbleId((prev) => {
        if (prev && rows.some((b) => b.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    }
    void load();
  }, [workspaceId]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <WorkspaceRail />
      <BubbleSidebar
        workspaceId={workspaceId}
        bubbles={bubbles}
        selectedBubbleId={selectedBubbleId}
        onSelectBubble={setSelectedBubbleId}
        onBubblesChange={setBubbles}
        canWrite={canWrite}
      />
      <div className="flex min-w-0 flex-1">
        <ChatPane bubbleId={selectedBubbleId} canWrite={canWrite} />
        <KanbanPane bubbleId={selectedBubbleId} canWrite={canWrite} />
      </div>
      {children}
    </div>
  );
}
