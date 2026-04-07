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
import { cn } from '@/lib/utils';
import { fetchPendingJoinRequestCountAndPreview } from '@/lib/workspace-join-requests';
import type { JoinRequestPreviewItem } from '@/lib/workspace-join-requests';
import { useUserProfileStore } from '@/store/userProfileStore';
import { asComments } from '@/types/task-modal';
import {
  bubbleSidebarCollapsedStorageKey,
  chatCollapsedStorageKey,
  kanbanCollapsedStorageKey,
  workspaceRailCollapsedStorageKey,
} from '@/lib/layout-collapse-keys';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';
import { ThemeScope } from '@/components/theme/ThemeScope';
import { resolveEffectiveCategory, useThemeOverride } from '@/hooks/use-theme-override';

type Props = {
  workspaceId: string;
  initialRole: 'admin' | 'member' | 'guest';
  initialPendingJoinRequestCount?: number;
  initialJoinRequestPreview?: JoinRequestPreviewItem[];
  children: React.ReactNode;
};

export function DashboardShell({
  workspaceId,
  initialRole,
  initialPendingJoinRequestCount = 0,
  initialJoinRequestPreview = [],
  children,
}: Props) {
  const loadUserWorkspaces = useWorkspaceStore((s) => s.loadUserWorkspaces);
  const syncActiveFromRoute = useWorkspaceStore((s) => s.syncActiveFromRoute);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveBubble = useWorkspaceStore((s) => s.setActiveBubble);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const profile = useUserProfileStore((s) => s.profile);
  const [pendingJoinRequestCount, setPendingJoinRequestCount] = useState(
    initialPendingJoinRequestCount,
  );
  const [joinRequestBellPreview, setJoinRequestBellPreview] =
    useState<JoinRequestPreviewItem[]>(initialJoinRequestPreview);

  const [bubbles, setBubbles] = useState<BubbleRow[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(ALL_BUBBLES_BUBBLE_ID);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [taskModalInitialStatus, setTaskModalInitialStatus] = useState<string | null>(null);
  const [taskModalInitialTab, setTaskModalInitialTab] = useState<TaskModalTab | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [commentAlert, setCommentAlert] = useState<{ taskId: string; title: string } | null>(null);
  const [workspaceRailCollapsed, setWorkspaceRailCollapsed] = useState(false);
  const [bubbleSidebarCollapsed, setBubbleSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsedState] = useState(false);
  const [kanbanCollapsed, setKanbanCollapsedState] = useState(false);
  const [layoutHydrated, setLayoutHydrated] = useState(false);

  /** At least one of Messages or Kanban must stay expanded (not both strips-only). */
  const setChatCollapsed = useCallback((v: boolean) => {
    if (v) setKanbanCollapsedState(false);
    setChatCollapsedState(v);
  }, []);

  const setKanbanCollapsed = useCallback((v: boolean) => {
    if (v) setChatCollapsedState(false);
    setKanbanCollapsedState(v);
  }, []);

  const { categoryOverride } = useThemeOverride();

  const workspaceCategoryForUi =
    activeWorkspace?.id === workspaceId ? (activeWorkspace.category_type ?? null) : null;
  const effectiveKanbanCategory =
    workspaceCategoryForUi != null
      ? resolveEffectiveCategory(categoryOverride, workspaceCategoryForUi)
      : null;
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
    try {
      const w = localStorage.getItem(workspaceRailCollapsedStorageKey(workspaceId));
      const b = localStorage.getItem(bubbleSidebarCollapsedStorageKey(workspaceId));
      const c = localStorage.getItem(chatCollapsedStorageKey(workspaceId));
      let k = localStorage.getItem(kanbanCollapsedStorageKey(workspaceId)) === '1';
      const chatOn = c === '1';
      if (chatOn && k) k = false;
      setWorkspaceRailCollapsed(w === '1');
      setBubbleSidebarCollapsed(b === '1');
      setChatCollapsedState(chatOn);
      setKanbanCollapsedState(k);
    } catch {
      /* ignore */
    }
    setLayoutHydrated(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!layoutHydrated) return;
    try {
      localStorage.setItem(
        workspaceRailCollapsedStorageKey(workspaceId),
        workspaceRailCollapsed ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  }, [workspaceId, workspaceRailCollapsed, layoutHydrated]);

  useEffect(() => {
    if (!layoutHydrated) return;
    try {
      localStorage.setItem(
        bubbleSidebarCollapsedStorageKey(workspaceId),
        bubbleSidebarCollapsed ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  }, [workspaceId, bubbleSidebarCollapsed, layoutHydrated]);

  useEffect(() => {
    if (!layoutHydrated) return;
    try {
      localStorage.setItem(chatCollapsedStorageKey(workspaceId), chatCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [workspaceId, chatCollapsed, layoutHydrated]);

  useEffect(() => {
    if (!layoutHydrated) return;
    try {
      localStorage.setItem(kanbanCollapsedStorageKey(workspaceId), kanbanCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [workspaceId, kanbanCollapsed, layoutHydrated]);

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
    setPendingJoinRequestCount(initialPendingJoinRequestCount);
    setJoinRequestBellPreview(initialJoinRequestPreview);
  }, [workspaceId, initialPendingJoinRequestCount, initialJoinRequestPreview]);

  useEffect(() => {
    if (initialRole !== 'admin') return;
    const supabase = createClient();
    const refreshJoinRequests = () => {
      void fetchPendingJoinRequestCountAndPreview(supabase, workspaceId).then((r) => {
        setPendingJoinRequestCount(r.count);
        setJoinRequestBellPreview(r.preview);
      });
    };
    const channel = supabase
      .channel(`invitation_join_requests:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invitation_join_requests',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        refreshJoinRequests,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, initialRole]);

  useEffect(() => {
    if (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID) {
      setActiveBubble(makeAllBubblesBubbleRow(workspaceId));
      return;
    }
    const b = bubbles.find((x) => x.id === selectedBubbleId) ?? null;
    setActiveBubble(b);
  }, [bubbles, selectedBubbleId, setActiveBubble, workspaceId]);

  const railsCollapsed = workspaceRailCollapsed && bubbleSidebarCollapsed;
  /** Left stack shows a main strip (Messages or Kanban) + Bubbles + Workspace. */
  const tripleStack = railsCollapsed && (chatCollapsed || kanbanCollapsed);

  const workspaceRailProps = {
    collapsed: workspaceRailCollapsed,
    onCollapsedChange: setWorkspaceRailCollapsed,
    onOpenProfile: () => setProfileModalOpen(true),
    profileAvatarUrl: profile?.avatar_url,
    profileName: profile?.full_name ?? profile?.email,
  };

  const bubbleSidebarProps = {
    workspaceId,
    collapsed: bubbleSidebarCollapsed,
    onCollapsedChange: setBubbleSidebarCollapsed,
    bubbles,
    selectedBubbleId,
    onSelectBubble: setSelectedBubbleId,
    onBubblesChange: setBubbles,
    canWrite,
    isAdmin: initialRole === 'admin',
    pendingJoinRequestCount: initialRole === 'admin' ? pendingJoinRequestCount : 0,
    onOpenWorkspaceSettings: () => setWorkspaceSettingsOpen(true),
  };

  const themeCategoryBase =
    activeWorkspace?.id === workspaceId
      ? (activeWorkspace.category_type ?? 'business')
      : 'business';
  const effectiveThemeCategory = resolveEffectiveCategory(categoryOverride, themeCategoryBase);

  return (
    <ThemeScope category={effectiveThemeCategory}>
      <div className="flex h-screen min-h-0 overflow-hidden bg-background">
        {tripleStack ? (
          <div
            className={cn(
              'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border',
              COLLAPSED_COLUMN_WIDTH_CLASS,
            )}
          >
            {chatCollapsed ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border bg-black">
                <CollapsedColumnStrip
                  title="Messages"
                  expandTitle="Expand Messages"
                  expandAriaLabel="Expand Messages panel"
                  onExpand={() => setChatCollapsed(false)}
                  variant="black"
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border bg-background">
                <CollapsedColumnStrip
                  title="Kanban"
                  expandTitle="Expand Kanban"
                  expandAriaLabel="Expand Kanban panel"
                  onExpand={() => setKanbanCollapsed(false)}
                  variant="card"
                />
              </div>
            )}
            <BubbleSidebar {...bubbleSidebarProps} collapsedStackSlot="middle" />
            <WorkspaceRail {...workspaceRailProps} collapsedStackSlot="bottom" />
          </div>
        ) : railsCollapsed ? (
          <div
            className={cn(
              'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border',
              COLLAPSED_COLUMN_WIDTH_CLASS,
            )}
          >
            <BubbleSidebar {...bubbleSidebarProps} collapsedStackSlot="top" />
            <WorkspaceRail {...workspaceRailProps} collapsedStackSlot="bottom" />
          </div>
        ) : (
          <>
            <WorkspaceRail {...workspaceRailProps} />
            <BubbleSidebar {...bubbleSidebarProps} />
          </>
        )}
        <WorkspaceMainSplit
          workspaceId={workspaceId}
          chatCollapsed={chatCollapsed}
          onChatCollapsedChange={setChatCollapsed}
          kanbanCollapsed={kanbanCollapsed}
          omitCollapsedMessagesStrip={tripleStack && chatCollapsed}
          renderChat={({ onCollapse }) => (
            <ChatArea
              bubbles={bubbles}
              canWrite={canWrite}
              onOpenTask={openTaskModal}
              onCollapse={onCollapse}
              joinRequestBellPreview={initialRole === 'admin' ? joinRequestBellPreview : undefined}
            />
          )}
          board={
            <KanbanBoard
              canWrite={canWrite}
              bubbles={bubbles}
              onOpenTask={openTaskModal}
              onOpenCreateTask={openCreateTaskModal}
              workspaceCategory={effectiveKanbanCategory}
              calendarTimezone={workspaceCalendarTz}
              onCollapse={() => setKanbanCollapsed(true)}
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
          workspaceCategory={effectiveKanbanCategory}
          calendarTimezone={workspaceCalendarTz}
        />
        <WorkspaceSettingsModal
          open={workspaceSettingsOpen}
          onOpenChange={setWorkspaceSettingsOpen}
          workspaceId={workspaceId}
          isAdmin={initialRole === 'admin'}
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
    </ThemeScope>
  );
}
