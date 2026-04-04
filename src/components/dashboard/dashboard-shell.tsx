'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow } from '@/types/database';
import { ALL_BUBBLES_BUBBLE_ID, makeAllBubblesBubbleRow } from '@/lib/all-bubbles';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { WorkspaceRail } from '@/components/layout/WorkspaceRail';
import { BubbleSidebar } from './bubble-sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { WorkspaceMainSplit } from '@/components/dashboard/workspace-main-split';
import { TaskModal } from '@/components/modals/TaskModal';
import { ProfileModal } from '@/components/modals/ProfileModal';
import { useUserProfileStore } from '@/store/userProfileStore';

type Props = {
  workspaceId: string;
  initialRole: 'admin' | 'member' | 'guest';
  children: React.ReactNode;
};

export function DashboardShell({ workspaceId, initialRole, children }: Props) {
  const loadUserWorkspaces = useWorkspaceStore((s) => s.loadUserWorkspaces);
  const syncActiveFromRoute = useWorkspaceStore((s) => s.syncActiveFromRoute);
  const setActiveBubble = useWorkspaceStore((s) => s.setActiveBubble);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const profile = useUserProfileStore((s) => s.profile);
  const [bubbles, setBubbles] = useState<BubbleRow[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(ALL_BUBBLES_BUBBLE_ID);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const canWrite = initialRole !== 'guest';

  const openTaskModal = useCallback((id: string) => {
    setTaskModalTaskId(id);
    setTaskModalOpen(true);
  }, []);

  const openCreateTaskModal = useCallback(() => {
    setTaskModalTaskId(null);
    setTaskModalOpen(true);
  }, []);

  const onTaskModalOpenChange = useCallback((open: boolean) => {
    setTaskModalOpen(open);
    if (!open) setTaskModalTaskId(null);
  }, []);

  useEffect(() => {
    void loadUserWorkspaces();
    void syncActiveFromRoute(workspaceId);
    void loadProfile();
  }, [workspaceId, loadUserWorkspaces, syncActiveFromRoute, loadProfile]);

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
        if (prev === ALL_BUBBLES_BUBBLE_ID) return ALL_BUBBLES_BUBBLE_ID;
        if (prev && rows.some((b) => b.id === prev)) return prev;
        return ALL_BUBBLES_BUBBLE_ID;
      });
    }
    void load();
  }, [workspaceId]);

  useEffect(() => {
    if (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID) {
      setActiveBubble(makeAllBubblesBubbleRow(workspaceId));
      return;
    }
    const b = bubbles.find((x) => x.id === selectedBubbleId) ?? null;
    setActiveBubble(b);
  }, [bubbles, selectedBubbleId, setActiveBubble, workspaceId]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <WorkspaceRail
        onOpenProfile={() => setProfileModalOpen(true)}
        profileAvatarUrl={profile?.avatar_url}
        profileName={profile?.full_name ?? profile?.email}
      />
      <BubbleSidebar
        workspaceId={workspaceId}
        bubbles={bubbles}
        selectedBubbleId={selectedBubbleId}
        onSelectBubble={setSelectedBubbleId}
        onBubblesChange={setBubbles}
        canWrite={canWrite}
      />
      <WorkspaceMainSplit
        workspaceId={workspaceId}
        renderChat={({ onCollapse }) => (
          <ChatArea
            bubbles={bubbles}
            canWrite={canWrite}
            onOpenTask={openTaskModal}
            onCollapse={onCollapse}
          />
        )}
        board={
          <KanbanBoard
            canWrite={canWrite}
            bubbles={bubbles}
            onOpenTask={openTaskModal}
            onOpenCreateTask={openCreateTaskModal}
          />
        }
      />
      <TaskModal
        open={taskModalOpen}
        onOpenChange={onTaskModalOpenChange}
        taskId={taskModalTaskId}
        bubbleId={
          selectedBubbleId === ALL_BUBBLES_BUBBLE_ID ? (bubbles[0]?.id ?? null) : selectedBubbleId
        }
        workspaceId={workspaceId}
        canWrite={canWrite}
        onCreated={(id) => setTaskModalTaskId(id)}
      />
      <ProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
      {children}
    </div>
  );
}
