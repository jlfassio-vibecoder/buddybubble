'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow, TaskRow } from '@/types/database';
import { ALL_BUBBLES_BUBBLE_ID, makeAllBubblesBubbleRow } from '@/lib/all-bubbles';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { WorkspaceRail } from '@/components/layout/WorkspaceRail';
import { BubbleSidebar } from './bubble-sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { WorkspaceMainSplit } from '@/components/dashboard/workspace-main-split';
import { TaskModal, type TaskModalTab } from '@/components/modals/TaskModal';
import { WorkspaceSettingsModal } from '@/components/modals/WorkspaceSettingsModal';
import { ProfileModal } from '@/components/modals/ProfileModal';
import { Button } from '@/components/ui/button';
import { useUserProfileStore } from '@/store/userProfileStore';
import { asComments } from '@/types/task-modal';

type Props = {
  workspaceId: string;
  initialRole: 'admin' | 'member' | 'guest';
  children: React.ReactNode;
};

export function DashboardShell({ workspaceId, initialRole, children }: Props) {
  const loadUserWorkspaces = useWorkspaceStore((s) => s.loadUserWorkspaces);
  const syncActiveFromRoute = useWorkspaceStore((s) => s.syncActiveFromRoute);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveBubble = useWorkspaceStore((s) => s.setActiveBubble);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const profile = useUserProfileStore((s) => s.profile);
  const [bubbles, setBubbles] = useState<BubbleRow[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(ALL_BUBBLES_BUBBLE_ID);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [taskModalInitialStatus, setTaskModalInitialStatus] = useState<string | null>(null);
  const [taskModalInitialTab, setTaskModalInitialTab] = useState<TaskModalTab | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [commentAlert, setCommentAlert] = useState<{ taskId: string; title: string } | null>(null);

  const workspaceCategoryForUi =
    activeWorkspace?.id === workspaceId ? (activeWorkspace.category_type ?? null) : null;
  const workspaceCalendarTz =
    activeWorkspace?.id === workspaceId ? (activeWorkspace.calendar_timezone ?? null) : null;

  const taskCommentCountsRef = useRef<Map<string, number>>(new Map());
  const taskModalForToastRef = useRef<{ open: boolean; taskId: string | null }>({
    open: false,
    taskId: null,
  });

  const canWrite = initialRole !== 'guest';

  const openTaskModal = useCallback((id: string, opts?: { tab?: TaskModalTab }) => {
    setTaskModalTaskId(id);
    setTaskModalInitialTab(opts?.tab ?? null);
    setTaskModalOpen(true);
  }, []);

  const openCreateTaskModal = useCallback((opts?: { status?: string }) => {
    setTaskModalInitialStatus(opts?.status ?? null);
    setTaskModalInitialTab(null);
    setTaskModalTaskId(null);
    setTaskModalOpen(true);
  }, []);

  const onTaskModalOpenChange = useCallback((open: boolean) => {
    setTaskModalOpen(open);
    if (!open) {
      setTaskModalTaskId(null);
      setTaskModalInitialStatus(null);
      setTaskModalInitialTab(null);
    }
  }, []);

  useEffect(() => {
    taskModalForToastRef.current = { open: taskModalOpen, taskId: taskModalTaskId };
  }, [taskModalOpen, taskModalTaskId]);

  useEffect(() => {
    taskCommentCountsRef.current = new Map();
  }, [workspaceId]);

  useEffect(() => {
    const myId = profile?.id;
    if (!myId || bubbles.length === 0) return;

    const supabase = createClient();
    const channelName = `task-comment-alerts:${workspaceId}:${[...bubbles.map((b) => b.id)].sort().join(',')}`;
    const channel = supabase.channel(channelName);

    const onTaskUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as TaskRow;
      if (!row?.id) return;

      const list = asComments(row.comments);
      const next = list.length;
      const prev = taskCommentCountsRef.current.get(row.id);

      if (prev === undefined) {
        taskCommentCountsRef.current.set(row.id, next);
        return;
      }
      if (next <= prev) {
        taskCommentCountsRef.current.set(row.id, next);
        return;
      }

      const last = list[list.length - 1];
      if (last && last.user_id === myId) {
        taskCommentCountsRef.current.set(row.id, next);
        return;
      }

      const modal = taskModalForToastRef.current;
      if (modal.open && modal.taskId === row.id) {
        taskCommentCountsRef.current.set(row.id, next);
        return;
      }

      taskCommentCountsRef.current.set(row.id, next);
      setCommentAlert({ taskId: row.id, title: row.title });
    };

    for (const b of bubbles) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${b.id}`,
        },
        onTaskUpdate,
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, bubbles, profile?.id]);

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
        isAdmin={initialRole === 'admin'}
        onOpenWorkspaceSettings={() => setWorkspaceSettingsOpen(true)}
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
            workspaceCategory={workspaceCategoryForUi}
            calendarTimezone={workspaceCalendarTz}
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
        initialCreateStatus={taskModalInitialStatus}
        initialTab={taskModalInitialTab}
        workspaceCategory={workspaceCategoryForUi}
        calendarTimezone={workspaceCalendarTz}
      />
      <WorkspaceSettingsModal
        open={workspaceSettingsOpen}
        onOpenChange={setWorkspaceSettingsOpen}
        workspaceId={workspaceId}
        onSaved={() => {
          void loadUserWorkspaces().then(() => syncActiveFromRoute(workspaceId));
        }}
      />
      <ProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
      {commentAlert ? (
        <div
          className="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg"
          role="status"
        >
          <p className="min-w-0 flex-1 text-sm text-foreground">
            Someone commented on &ldquo;{commentAlert.title}&rdquo;
          </p>
          <Button
            size="sm"
            onClick={() => {
              openTaskModal(commentAlert.taskId, { tab: 'comments' });
              setCommentAlert(null);
            }}
          >
            Open
          </Button>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
            onClick={() => setCommentAlert(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
