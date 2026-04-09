'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow, TaskRow } from '@/types/database';
import {
  ALL_BUBBLES_BUBBLE_ID,
  makeAllBubblesBubbleRow,
  resolveBuddyBubbleDisplayTitle,
} from '@/lib/all-bubbles';
import { normalizeMobileTab } from '@/lib/mobile-crm-tab';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { WorkspaceRail } from '@/components/layout/WorkspaceRail';
import { BubbleSidebar } from './bubble-sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { CalendarRail } from '@/components/dashboard/calendar-rail';
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
  calendarCollapsedStorageKey,
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
import { useIsNarrowBelowMd } from '@/hooks/use-is-narrow-below-md';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileSidebarSheet } from '@/components/layout/MobileSidebarSheet';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import {
  DesktopViewSwitcher,
  type DesktopFocusMode,
} from '@/components/layout/desktop-view-switcher';

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const embedMode = searchParams.get('embed') === 'true';
  const narrowViewport = useIsNarrowBelowMd();
  const layoutMobile = !embedMode && narrowViewport;
  const mobileTab = normalizeMobileTab(searchParams.get('tab'));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const [calendarCollapsed, setCalendarCollapsedState] = useState(false);
  const [taskViewsNonce, setTaskViewsNonce] = useState(0);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  /** Bumped when the calendar is collapsed so `KanbanBoard` expands its column strip (avoid empty stage). */
  const [boardStripExpandNonce, setBoardStripExpandNonce] = useState(0);

  const bumpTaskViews = useCallback(() => setTaskViewsNonce((n) => n + 1), []);

  /** At least one of Messages or Kanban must stay expanded (not both strips-only). */
  const setChatCollapsed = useCallback((v: boolean) => {
    if (v) setKanbanCollapsedState(false);
    setChatCollapsedState(v);
  }, []);

  /** Hiding Kanban (Messages + Calendar stage): keep Calendar expanded so the stage is never blank. */
  const setKanbanCollapsed = useCallback((v: boolean) => {
    if (v) {
      setChatCollapsedState(false);
      setCalendarCollapsedState(false);
    }
    setKanbanCollapsedState(v);
  }, []);

  /**
   * Collapsing the calendar strip: show the Kanban panel and expand board columns so the user
   * never lands on an empty main area (toolbar-only).
   */
  const setCalendarCollapsed = useCallback((v: boolean) => {
    if (v) {
      setKanbanCollapsedState(false);
      setBoardStripExpandNonce((n) => n + 1);
    }
    setCalendarCollapsedState(v);
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

  /**
   * Hard invariant (render): if the Kanban panel is hidden, the calendar cannot be strip-collapsed.
   * Derived so UI cannot desync from batched state or missed updates.
   */
  const calendarRailIsCollapsed = kanbanCollapsed ? false : calendarCollapsed;

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

  const calendarContext = useMemo(
    () => ({
      workspaceId,
      bubbles,
      activeBubbleId: selectedBubbleId,
      canWrite,
      calendarTimezone: workspaceCalendarTz,
      workspaceCategory: effectiveKanbanCategory,
      onOpenTask: openTaskModal,
    }),
    [
      workspaceId,
      bubbles,
      selectedBubbleId,
      canWrite,
      workspaceCalendarTz,
      effectiveKanbanCategory,
      openTaskModal,
    ],
  );

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
    setBoardStripExpandNonce(0);
  }, [workspaceId]);

  useEffect(() => {
    try {
      const w = localStorage.getItem(workspaceRailCollapsedStorageKey(workspaceId));
      const b = localStorage.getItem(bubbleSidebarCollapsedStorageKey(workspaceId));
      const c = localStorage.getItem(chatCollapsedStorageKey(workspaceId));
      let k = localStorage.getItem(kanbanCollapsedStorageKey(workspaceId)) === '1';
      const chatOn = c === '1';
      if (chatOn && k) k = false;
      let cal = localStorage.getItem(calendarCollapsedStorageKey(workspaceId)) === '1';
      /** Kanban hidden + calendar strip = blank main stage; open calendar. */
      if (k && cal) cal = false;
      setWorkspaceRailCollapsed(w === '1');
      setBubbleSidebarCollapsed(b === '1');
      setChatCollapsedState(chatOn);
      setKanbanCollapsedState(k);
      setCalendarCollapsedState(cal);
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
    if (!layoutHydrated) return;
    try {
      localStorage.setItem(calendarCollapsedStorageKey(workspaceId), calendarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [workspaceId, calendarCollapsed, layoutHydrated]);

  /** Mobile `?tab=`: single-pane chat / board / calendar (desktop ignores for layout). */
  useEffect(() => {
    if (!layoutHydrated || embedMode) return;
    const mq = window.matchMedia('(max-width: 767.98px)');
    if (!mq.matches) return;
    const tab = normalizeMobileTab(searchParams.get('tab'));
    if (tab === 'chat') {
      setChatCollapsedState(false);
      setKanbanCollapsedState(true);
    } else if (tab === 'board') {
      setChatCollapsedState(true);
      setKanbanCollapsedState(false);
    } else {
      setChatCollapsedState(true);
      setKanbanCollapsedState(true);
      setCalendarCollapsedState(false);
    }
  }, [layoutHydrated, embedMode, searchParams]);

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
    onOpenProfile: embedMode ? undefined : () => setProfileModalOpen(true),
    profileAvatarUrl: profile?.avatar_url,
    profileName: profile?.full_name ?? profile?.email,
    embedMode,
  };

  const onSelectBubble = useCallback(
    (id: string) => {
      setSelectedBubbleId(id);
      setMobileNavOpen(false);
      if (embedMode) return;
      const mq = window.matchMedia('(max-width: 767.98px)');
      if (mq.matches) {
        const q = new URLSearchParams(searchParams.toString());
        q.set('tab', 'chat');
        router.replace(`${pathname}?${q.toString()}`, { scroll: false });
      }
    },
    [embedMode, pathname, router, searchParams],
  );

  const buddyBubbleTitle = useMemo(
    () => resolveBuddyBubbleDisplayTitle(selectedBubbleId, bubbles, activeWorkspace?.name ?? null),
    [selectedBubbleId, bubbles, activeWorkspace?.name],
  );

  const workspaceTitle = useMemo(() => {
    if (activeWorkspace?.id !== workspaceId) return 'BuddyBubble';
    const n = activeWorkspace?.name?.trim();
    return n || 'BuddyBubble';
  }, [activeWorkspace?.id, activeWorkspace?.name, workspaceId]);

  const bubbleSidebarProps = {
    workspaceId,
    collapsed: bubbleSidebarCollapsed,
    onCollapsedChange: setBubbleSidebarCollapsed,
    bubbles,
    selectedBubbleId,
    onSelectBubble,
    onBubblesChange: setBubbles,
    canWrite,
    isAdmin: initialRole === 'admin',
    pendingJoinRequestCount: initialRole === 'admin' ? pendingJoinRequestCount : 0,
    onOpenWorkspaceSettings: embedMode ? undefined : () => setWorkspaceSettingsOpen(true),
    workspaceTitle,
  };

  const drawerRailProps = {
    ...workspaceRailProps,
    collapsed: false,
    onCollapsedChange: () => {},
    hideRailCollapseButton: true,
  };

  const drawerBubbleProps = {
    ...bubbleSidebarProps,
    collapsed: false,
    onCollapsedChange: () => {},
    hideSidebarCollapseButton: true,
  };

  const omitMobileNonChatStrip = layoutMobile && mobileTab !== 'chat';
  const hideCalendarForMobileBoard = layoutMobile && mobileTab === 'board';

  const themeCategoryBase =
    activeWorkspace?.id === workspaceId
      ? (activeWorkspace.category_type ?? 'business')
      : 'business';
  const effectiveThemeCategory = resolveEffectiveCategory(categoryOverride, themeCategoryBase);

  const desktopFocusModeActive = useMemo((): DesktopFocusMode | null => {
    if (layoutMobile || embedMode) return null;
    if (!chatCollapsed && kanbanCollapsed) return 'chat';
    if (chatCollapsed && kanbanCollapsed) return 'calendar';
    if (chatCollapsed && !kanbanCollapsed && calendarCollapsed) return 'board';
    if (!chatCollapsed && !kanbanCollapsed && calendarCollapsed) return 'split';
    return null;
  }, [layoutMobile, embedMode, chatCollapsed, kanbanCollapsed, calendarCollapsed]);

  const applyDesktopFocusMode = useCallback(
    (mode: DesktopFocusMode) => {
      if (!layoutHydrated || embedMode) return;
      switch (mode) {
        case 'chat':
          setChatCollapsedState(false);
          setKanbanCollapsedState(true);
          setCalendarCollapsedState(true);
          break;
        case 'board':
          setChatCollapsedState(true);
          setKanbanCollapsedState(false);
          setCalendarCollapsedState(true);
          setBoardStripExpandNonce((n) => n + 1);
          break;
        case 'calendar':
          setChatCollapsedState(true);
          setKanbanCollapsedState(true);
          setCalendarCollapsedState(false);
          break;
        case 'split':
          setChatCollapsedState(false);
          setKanbanCollapsedState(false);
          setCalendarCollapsedState(true);
          setBoardStripExpandNonce((n) => n + 1);
          break;
        default:
          break;
      }
    },
    [embedMode, layoutHydrated],
  );

  return (
    <ThemeScope category={effectiveThemeCategory}>
      <div className="flex h-screen min-h-0 flex-col bg-background md:flex-row md:overflow-hidden">
        {layoutMobile ? <MobileHeader title={buddyBubbleTitle} /> : null}
        {layoutMobile ? (
          <MobileSidebarSheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <WorkspaceRail {...drawerRailProps} />
            <BubbleSidebar {...drawerBubbleProps} />
          </MobileSidebarSheet>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-16 md:pb-0">
          {!embedMode ? (
            <div className="max-md:hidden flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
              <span
                className="min-w-0 truncate text-sm font-semibold text-foreground"
                title={`${buddyBubbleTitle} - ${workspaceTitle}`}
              >
                {buddyBubbleTitle}
                <span className="font-normal text-muted-foreground"> - </span>
                {workspaceTitle}
              </span>
              <DesktopViewSwitcher
                activeMode={desktopFocusModeActive}
                onChange={applyDesktopFocusMode}
                disabled={!layoutHydrated}
              />
            </div>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-0 md:flex-row">
            <div className="hidden h-full min-h-0 shrink-0 md:flex md:flex-row">
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
                        edge="left"
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
                        edge="left"
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
            </div>

            <WorkspaceMainSplit
              workspaceId={workspaceId}
              chatCollapsed={chatCollapsed}
              onChatCollapsedChange={setChatCollapsed}
              kanbanCollapsed={kanbanCollapsed}
              calendarCollapsed={calendarRailIsCollapsed}
              omitCollapsedMessagesStrip={(tripleStack && chatCollapsed) || omitMobileNonChatStrip}
              hideCalendarSlot={hideCalendarForMobileBoard}
              hideMainStageBelowMd={layoutMobile && mobileTab === 'chat'}
              taskViewsNonce={taskViewsNonce}
              calendarRail={
                <CalendarRail
                  isCollapsed={calendarRailIsCollapsed}
                  onExpand={() => setCalendarCollapsed(false)}
                  onCollapse={() => setCalendarCollapsed(true)}
                  buddyBubbleTitle={buddyBubbleTitle}
                  {...calendarContext}
                />
              }
              renderChat={({ onCollapse }) => (
                <ChatArea
                  bubbles={bubbles}
                  canWrite={canWrite}
                  onOpenTask={openTaskModal}
                  onCollapse={onCollapse}
                  workspaceTitle={workspaceTitle}
                  joinRequestBellPreview={
                    initialRole === 'admin' ? joinRequestBellPreview : undefined
                  }
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
                  boardStripExpandNonce={boardStripExpandNonce}
                  calendarStripCollapsed={calendarRailIsCollapsed}
                  onExpandCalendarWhenKanbanStripCollapse={() => setCalendarCollapsed(false)}
                  onRetractKanbanPanel={() => setKanbanCollapsed(true)}
                  buddyBubbleTitle={buddyBubbleTitle}
                />
              }
            />
          </div>
        </div>

        {layoutMobile ? <MobileTabBar onOpenNavigation={() => setMobileNavOpen(true)} /> : null}

        <TaskModal
          open={taskModalOpen}
          onOpenChange={onTaskModalOpenChange}
          taskId={taskModalTaskId}
          bubbleId={
            selectedBubbleId === ALL_BUBBLES_BUBBLE_ID ? (bubbles[0]?.id ?? null) : selectedBubbleId
          }
          workspaceId={workspaceId}
          canWrite={canWrite}
          onCreated={(id) => {
            setTaskModalTaskId(id);
            bumpTaskViews();
          }}
          initialCreateStatus={taskModalInitialStatus}
          initialTab={taskModalInitialTab}
          workspaceCategory={effectiveKanbanCategory}
          calendarTimezone={workspaceCalendarTz}
          onTaskArchived={bumpTaskViews}
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
            className="pointer-events-auto fixed bottom-20 left-1/2 z-[100] flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg md:bottom-6"
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
