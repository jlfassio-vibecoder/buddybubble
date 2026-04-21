'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { BubbleMemberRole, BubbleRow, ItemType, TaskRow } from '@/types/database';
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
import {
  TaskModal,
  type OpenTaskOptions,
  type TaskModalTab,
  type TaskModalViewMode,
} from '@/components/modals/TaskModal';
import { WorkspaceSettingsModal } from '@/components/modals/WorkspaceSettingsModal';
import { PeopleInvitesModal } from '@/components/modals/PeopleInvitesModal';
import { CreateWorkspaceModal } from '@/components/modals/CreateWorkspaceModal';
import { ProfileModal, type ProfilePermissionsContext } from '@/components/modals/ProfileModal';
import { ProfileCompletionModal } from '@/components/modals/ProfileCompletionModal';
import { AnalyticsBoard } from '@/components/fitness/AnalyticsBoard';
import { ClassesBoard } from '@/components/fitness/ClassesBoard';
import { ProgramsBoard } from '@/components/fitness/ProgramsBoard';
import { WorkoutPlayer } from '@/components/fitness/WorkoutPlayer';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import { FitnessProfileSheet } from '@/components/fitness/FitnessProfileSheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { markLiveSessionInviteMessageEnded } from '@/lib/mark-live-session-invite-ended';
import { fetchPendingJoinRequestCountAndPreview } from '@/lib/workspace-join-requests';
import type { JoinRequestPreviewItem } from '@/lib/workspace-join-requests';
import { useUserProfileStore } from '@/store/userProfileStore';
import {
  bubbleSidebarCollapsedStorageKey,
  calendarCollapsedStorageKey,
  chatCollapsedStorageKey,
  dockWorkspaceSplitStorageKey,
  kanbanCollapsedStorageKey,
  theaterBoardDockSplitStorageKey,
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
import type { MemberRole } from '@/types/database';
import { parseMemberRole } from '@/lib/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdatePresence } from '@/hooks/use-update-presence';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import { DashboardLiveVideoDock } from '@/components/dashboard/dashboard-live-video-dock';
import {
  WorkoutDeckSelectionProvider,
  useWorkoutDeckSelection,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { TrialPaywallGuard } from '@/components/subscription/trial-paywall-guard';
import { LiveSessionRuntimeProvider } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import type { LiveTheaterLayoutPlan } from '@/features/live-video/theater/live-theater-layout.types';
import { LiveVideoSessionShell } from '@/features/live-video/theater/live-video-session-shell';
import { isDashboardProfileComplete } from '@/lib/profile-helpers';
import {
  shouldBlockWorkoutForExpiredMemberPreview,
  shouldSoftLockTrialSurfaces,
} from '@/lib/member-trial-soft-lock';
import { TrialBanner } from '@/components/subscription/trial-banner';
import { ExpiredGate } from '@/components/subscription/expired-gate';
import { StartTrialModal } from '@/components/subscription/start-trial-modal';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { AnalyticsProvider } from '@/components/analytics/analytics-provider';
import type { Layout } from 'react-resizable-panels';
import { useGroupRef } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

const DASH_DOCK_PANEL_ID = 'dash-live-dock';
const DASH_WORKSPACE_PANEL_ID = 'dash-workspace';
const THEATER_BOARD_PANEL_ID = 'theater-board';
const THEATER_DOCK_PANEL_ID = 'theater-dock';

function LiveTheaterPlanBranch({
  children,
}: {
  children: (plan: LiveTheaterLayoutPlan) => ReactNode;
}) {
  const plan = useLiveTheaterLayoutPlanContext();
  return <>{children(plan)}</>;
}

function readDockWorkspaceLayout(workspaceId: string): Layout {
  const fallback: Layout = {
    [DASH_DOCK_PANEL_ID]: 42,
    [DASH_WORKSPACE_PANEL_ID]: 58,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(dockWorkspaceSplitStorageKey(workspaceId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Layout;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed[DASH_DOCK_PANEL_ID] === 'number' &&
      typeof parsed[DASH_WORKSPACE_PANEL_ID] === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function readTheaterBoardDockLayout(workspaceId: string): Layout {
  const fallback: Layout = {
    [THEATER_BOARD_PANEL_ID]: 42,
    [THEATER_DOCK_PANEL_ID]: 58,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(theaterBoardDockSplitStorageKey(workspaceId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Layout;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed[THEATER_BOARD_PANEL_ID] === 'number' &&
      typeof parsed[THEATER_DOCK_PANEL_ID] === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

type Props = {
  workspaceId: string;
  initialRole: MemberRole;
  initialPendingJoinRequestCount?: number;
  initialJoinRequestPreview?: JoinRequestPreviewItem[];
  children: React.ReactNode;
};

function DashboardShellInner({
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
  const storeActiveBubble = useWorkspaceStore((s) => s.activeBubble);
  const setActiveBubble = useWorkspaceStore((s) => s.setActiveBubble);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const profile = useUserProfileStore((s) => s.profile);
  const [pendingJoinRequestCount, setPendingJoinRequestCount] = useState(
    initialPendingJoinRequestCount,
  );
  const [joinRequestBellPreview, setJoinRequestBellPreview] =
    useState<JoinRequestPreviewItem[]>(initialJoinRequestPreview);

  const [bubbles, setBubbles] = useState<BubbleRow[]>([]);
  /** Current user's explicit bubble_members.role for the selected bubble (null if none or aggregate view). */
  const [myBubbleRole, setMyBubbleRole] = useState<BubbleMemberRole | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(ALL_BUBBLES_BUBBLE_ID);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);
  const [taskModalInitialStatus, setTaskModalInitialStatus] = useState<string | null>(null);
  const [taskModalInitialTab, setTaskModalInitialTab] = useState<TaskModalTab | null>(null);
  const [taskModalViewMode, setTaskModalViewMode] = useState<TaskModalViewMode>('full');
  const [taskModalAutoEdit, setTaskModalAutoEdit] = useState(false);
  const [taskModalOpenWorkoutViewer, setTaskModalOpenWorkoutViewer] = useState(false);
  const [taskModalCommentThreadMessageId, setTaskModalCommentThreadMessageId] = useState<
    string | null
  >(null);
  const [taskModalInitialCreateItemType, setTaskModalInitialCreateItemType] =
    useState<ItemType | null>(null);
  const [taskModalInitialCreateTitle, setTaskModalInitialCreateTitle] = useState<string | null>(
    null,
  );
  const [taskModalInitialCreateWorkoutDurationMin, setTaskModalInitialCreateWorkoutDurationMin] =
    useState<string | null>(null);
  const [taskModalCreateBubbleId, setTaskModalCreateBubbleId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  /** `null` = session email not resolved yet (avoid treating legacy users as incomplete during fetch). */
  const [authHasSessionEmail, setAuthHasSessionEmail] = useState<boolean | null>(null);
  const [peopleInvitesOpen, setPeopleInvitesOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [fitnessProfileOpen, setFitnessProfileOpen] = useState(false);
  const [commentAlert, setCommentAlert] = useState<{
    taskId: string;
    title: string;
    messageId: string;
  } | null>(null);
  const [workoutPlayerTask, setWorkoutPlayerTask] = useState<TaskRow | null>(null);
  const [workspaceRailCollapsed, setWorkspaceRailCollapsed] = useState(false);
  const [bubbleSidebarCollapsed, setBubbleSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsedState] = useState(false);
  const [kanbanCollapsed, setKanbanCollapsedState] = useState(false);
  const [calendarCollapsed, setCalendarCollapsedState] = useState(false);
  const [taskViewsNonce, setTaskViewsNonce] = useState(0);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  /** Bumped when the calendar is collapsed so `KanbanBoard` expands its column strip (avoid empty stage). */
  const [boardStripExpandNonce, setBoardStripExpandNonce] = useState(0);

  const workoutDeckSelection = useWorkoutDeckSelection();

  const bumpTaskViews = useCallback(() => setTaskViewsNonce((n) => n + 1), []);

  /** Clears chat deep-link open options so TaskModal tab routing cannot re-apply Comments from stale props. */
  const clearTaskModalCommentDeepLink = useCallback(() => {
    setTaskModalCommentThreadMessageId(null);
    setTaskModalInitialTab(null);
    setTaskModalViewMode('full');
  }, []);

  const openPeopleInvites = useCallback(() => {
    setPeopleInvitesOpen(true);
    if (layoutMobile) setMobileNavOpen(false);
  }, [layoutMobile]);

  const openCreateWorkspace = useCallback(() => {
    setCreateWorkspaceOpen(true);
  }, []);

  /** At least one of Messages or Kanban must stay expanded (not both strips-only). */
  const setChatCollapsed = useCallback((v: boolean) => {
    if (v) setKanbanCollapsedState(false);
    setChatCollapsedState(v);
  }, []);

  /** Hiding Kanban: ensure chat stays open (shell invariant). Calendar rail collapse is derived when Kanban is hidden. */
  const setKanbanCollapsed = useCallback((v: boolean) => {
    if (v) {
      setChatCollapsedState(false);
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
  const showFamilyNames =
    workspaceCategoryForUi === 'kids' || workspaceCategoryForUi === 'community';
  const effectiveKanbanCategory =
    workspaceCategoryForUi != null
      ? resolveEffectiveCategory(categoryOverride, workspaceCategoryForUi)
      : null;
  const workspaceCalendarTz =
    activeWorkspace?.id === workspaceId ? (activeWorkspace.calendar_timezone ?? null) : null;

  // Copilot suggestion ignored: storing analytics bubble id in a ref does not fix rename; a stable channel key would need schema (e.g. bubble slug) — V1 matches seed name "Analytics".
  /** True when the selected bubble is the Analytics bubble in a fitness workspace. */
  const isAnalyticsBubble =
    workspaceCategoryForUi === 'fitness' &&
    selectedBubbleId !== ALL_BUBBLES_BUBBLE_ID &&
    bubbles.find((b) => b.id === selectedBubbleId)?.name === 'Analytics';

  /** True when the selected bubble is the Classes bubble in a fitness workspace. */
  const isClassesBubble =
    workspaceCategoryForUi === 'fitness' &&
    selectedBubbleId !== ALL_BUBBLES_BUBBLE_ID &&
    bubbles.find((b) => b.id === selectedBubbleId)?.name === 'Classes';

  /** True when the selected bubble is the Programs bubble in a fitness workspace. */
  const isProgramsBubble =
    workspaceCategoryForUi === 'fitness' &&
    selectedBubbleId !== ALL_BUBBLES_BUBBLE_ID &&
    bubbles.find((b) => b.id === selectedBubbleId)?.name === 'Programs';

  /**
   * Hard invariant (render): if the Kanban panel is hidden, the calendar cannot be strip-collapsed.
   * Derived so UI cannot desync from batched state or missed updates.
   */
  const calendarRailIsCollapsed = kanbanCollapsed ? false : calendarCollapsed;

  /** When set, `TaskModal` `onCreated` also runs this (chat: post message with `attached_task_id`). */
  const chatCardOnCreatedRef = useRef<((taskId: string) => void) | null>(null);
  const taskModalForToastRef = useRef<{ open: boolean; taskId: string | null }>({
    open: false,
    taskId: null,
  });
  const taskCommentToastTitleByIdRef = useRef<Map<string, string>>(new Map());
  /** One-time desktop rail collapse per live session join (user can expand rails again). */
  const liveVideoTheaterRailsPrimedForSessionIdRef = useRef<string | null>(null);

  const activeBubbleIsPrivate = useMemo(() => {
    if (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID) return false;
    return bubbles.find((b) => b.id === selectedBubbleId)?.is_private ?? false;
  }, [bubbles, selectedBubbleId]);

  /**
   * Prefer the role from the client workspace store (fresh `workspace_members` read) over the
   * layout SSR prop so owner/admin UI (e.g. invite) matches the DB when the server prop is stale.
   */
  const effectiveWorkspaceRole = useMemo((): MemberRole => {
    if (activeWorkspace?.id === workspaceId) {
      return parseMemberRole(String(activeWorkspace.role));
    }
    return initialRole;
  }, [activeWorkspace, workspaceId, initialRole]);

  useEffect(() => {
    const uid = profile?.id;
    if (!uid) {
      setMyBubbleRole(null);
      return;
    }
    if (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID || selectedBubbleId === null) {
      setMyBubbleRole(null);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    void supabase
      .from('bubble_members')
      .select('role')
      .eq('bubble_id', selectedBubbleId)
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setMyBubbleRole(null);
          return;
        }
        const r = (data as { role?: string } | null)?.role;
        setMyBubbleRole(r === 'editor' || r === 'viewer' ? r : null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, profile?.id, selectedBubbleId, bubbles]);

  const { canWriteTasks, canPostMessages, canCreateWorkspaceBubble, isAdmin, isOwner } =
    usePermissions(effectiveWorkspaceRole, myBubbleRole, activeBubbleIsPrivate);

  useUpdatePresence({ embedMode, workspaceId });

  const initSubscription = useSubscriptionStore((s) => s.initSubscription);
  useEffect(() => {
    void initSubscription(workspaceId);
  }, [workspaceId, initSubscription]);

  const activeLiveVideoSession = useLiveVideoStore((s) => s.activeSession);
  const joinLiveVideoSession = useLiveVideoStore((s) => s.joinSession);

  useEffect(() => {
    if (activeLiveVideoSession && activeLiveVideoSession.workspaceId !== workspaceId) {
      useLiveVideoStore.getState().leaveSession();
    }
  }, [activeLiveVideoSession, workspaceId]);

  const liveVideoSessionWithUser = Boolean(activeLiveVideoSession && profile?.id);

  useEffect(() => {
    if (!activeLiveVideoSession) {
      liveVideoTheaterRailsPrimedForSessionIdRef.current = null;
    }
  }, [activeLiveVideoSession]);

  /** Desktop: collapse left rails once per join so theater gets maximum width (toggles still work). */
  useEffect(() => {
    if (!layoutHydrated) return;
    if (layoutMobile || embedMode) return;
    const sessionId = activeLiveVideoSession?.sessionId;
    if (!sessionId || !profile?.id) return;
    if (liveVideoTheaterRailsPrimedForSessionIdRef.current === sessionId) return;
    liveVideoTheaterRailsPrimedForSessionIdRef.current = sessionId;
    setWorkspaceRailCollapsed(true);
    setBubbleSidebarCollapsed(true);
    setChatCollapsed(true);
  }, [
    activeLiveVideoSession?.sessionId,
    embedMode,
    layoutHydrated,
    layoutMobile,
    profile?.id,
    setChatCollapsed,
  ]);

  /** Expand Kanban while picking cards into the workout deck (session UX; not theater collapse hacks). */
  useEffect(() => {
    if (!layoutHydrated) return;
    if (!workoutDeckSelection.isSelectingFromBoard) return;
    setKanbanCollapsed(false);
  }, [layoutHydrated, workoutDeckSelection.isSelectingFromBoard, setKanbanCollapsed]);

  const onLiveVideoLeaveSession = useCallback(async () => {
    const { activeSession, leaveSession } = useLiveVideoStore.getState();
    const inviteMessageId = activeSession?.inviteMessageId?.trim();
    const uid = profile?.id;
    if (inviteMessageId && uid && activeSession?.hostUserId === uid) {
      const supabase = createClient();
      await markLiveSessionInviteMessageEnded(supabase, inviteMessageId);
    }
    leaveSession();
  }, [profile?.id]);

  const handleJoinDevLiveVideo = useCallback(() => {
    const uid = profile?.id;
    if (!uid) return;
    joinLiveVideoSession({
      workspaceId,
      sessionId: `dashboard-${workspaceId}`,
      channelId: `bb-live-${workspaceId}`,
      hostUserId: uid,
      mode: 'workout',
    });
  }, [workspaceId, profile?.id, joinLiveVideoSession]);

  const openTaskModal = useCallback((id: string, opts?: OpenTaskOptions) => {
    chatCardOnCreatedRef.current = null;
    setTaskModalInitialCreateItemType(null);
    setTaskModalInitialCreateTitle(null);
    setTaskModalInitialCreateWorkoutDurationMin(null);
    setTaskModalCreateBubbleId(null);
    setTaskModalTaskId(id);
    const vm = opts?.viewMode ?? 'full';
    setTaskModalViewMode(vm);
    setTaskModalAutoEdit(opts?.autoEdit ?? false);
    setTaskModalOpenWorkoutViewer(opts?.openWorkoutViewer === true);
    setTaskModalCommentThreadMessageId(opts?.commentThreadMessageId?.trim() || null);
    if (vm === 'comments-only' && opts?.tab == null) {
      setTaskModalInitialTab('comments');
    } else {
      setTaskModalInitialTab(opts?.tab ?? null);
    }
    setTaskModalOpen(true);
  }, []);

  const openCreateTaskModal = useCallback(
    (opts?: {
      status?: string;
      itemType?: ItemType;
      title?: string;
      workoutDurationMin?: string | null;
      bubbleId?: string | null;
      /** When true, do not clear `chatCardOnCreatedRef` (caller just set it for chat compose). */
      preserveChatCallback?: boolean;
    }) => {
      if (!opts?.preserveChatCallback) {
        chatCardOnCreatedRef.current = null;
      }
      setTaskModalInitialStatus(opts?.status ?? null);
      setTaskModalInitialTab(null);
      setTaskModalViewMode('full');
      setTaskModalAutoEdit(false);
      setTaskModalOpenWorkoutViewer(false);
      setTaskModalCommentThreadMessageId(null);
      setTaskModalTaskId(null);
      setTaskModalInitialCreateItemType(opts?.itemType ?? null);
      setTaskModalInitialCreateTitle(opts?.title ?? null);
      setTaskModalInitialCreateWorkoutDurationMin(
        opts?.workoutDurationMin !== undefined ? opts.workoutDurationMin : null,
      );
      setTaskModalCreateBubbleId(opts?.bubbleId ?? null);
      setTaskModalOpen(true);
    },
    [],
  );

  const openChatComposeForTask = useCallback(
    (opts: { bubbleId: string | null; onTaskCreated: (taskId: string) => void }) => {
      chatCardOnCreatedRef.current = opts.onTaskCreated;
      openCreateTaskModal({ bubbleId: opts.bubbleId, preserveChatCallback: true });
    },
    [openCreateTaskModal],
  );

  const defaultTaskModalBubbleId = useMemo(
    () =>
      selectedBubbleId === ALL_BUBBLES_BUBBLE_ID ? (bubbles[0]?.id ?? null) : selectedBubbleId,
    [selectedBubbleId, bubbles],
  );

  const resolvedTaskModalBubbleId = useMemo(() => {
    if (taskModalTaskId) return defaultTaskModalBubbleId;
    if (taskModalCreateBubbleId) return taskModalCreateBubbleId;
    return defaultTaskModalBubbleId;
  }, [taskModalTaskId, taskModalCreateBubbleId, defaultTaskModalBubbleId]);

  const openTrialModal = useSubscriptionStore((s) => s.openTrialModal);

  const handleStartWorkout = useCallback(
    (task: TaskRow) => {
      if (shouldBlockWorkoutForExpiredMemberPreview(task.bubble_id, activeWorkspace, bubbles)) {
        openTrialModal();
        return;
      }
      setWorkoutPlayerTask(task);
    },
    [activeWorkspace, bubbles, openTrialModal],
  );

  const calendarContext = useMemo(
    () => ({
      workspaceId,
      bubbles,
      activeBubbleId: selectedBubbleId,
      canWrite: canWriteTasks,
      calendarTimezone: workspaceCalendarTz,
      workspaceCategory: effectiveKanbanCategory,
      onOpenTask: openTaskModal,
      workspaceMemberRole: effectiveWorkspaceRole,
      guestTaskUserId: profile?.id ?? null,
    }),
    [
      workspaceId,
      bubbles,
      selectedBubbleId,
      canWriteTasks,
      workspaceCalendarTz,
      effectiveKanbanCategory,
      openTaskModal,
      effectiveWorkspaceRole,
      profile?.id,
    ],
  );

  const onTaskModalOpenChange = useCallback((open: boolean) => {
    setTaskModalOpen(open);
    if (!open) {
      chatCardOnCreatedRef.current = null;
      setTaskModalTaskId(null);
      setTaskModalInitialStatus(null);
      setTaskModalInitialTab(null);
      setTaskModalViewMode('full');
      setTaskModalAutoEdit(false);
      setTaskModalOpenWorkoutViewer(false);
      setTaskModalCommentThreadMessageId(null);
      setTaskModalInitialCreateItemType(null);
      setTaskModalInitialCreateTitle(null);
      setTaskModalInitialCreateWorkoutDurationMin(null);
      setTaskModalCreateBubbleId(null);
    }
  }, []);

  useEffect(() => {
    taskModalForToastRef.current = { open: taskModalOpen, taskId: taskModalTaskId };
  }, [taskModalOpen, taskModalTaskId]);

  useEffect(() => {
    const myId = profile?.id;
    if (!myId || bubbles.length === 0) return;

    const supabase = createClient();
    const channelName = `task-comment-alerts:${workspaceId}:${[...bubbles.map((b) => b.id)].sort().join(',')}`;
    const channel = supabase.channel(channelName);

    const onMessageInsert = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as {
        id?: string;
        target_task_id?: string | null;
        user_id?: string | null;
      };
      const taskCommentTaskId = row.target_task_id;
      const messageId = typeof row.id === 'string' ? row.id : '';
      if (!taskCommentTaskId || !row.user_id) return;
      if (row.user_id === myId) return;

      const modal = taskModalForToastRef.current;
      if (modal.open && modal.taskId === taskCommentTaskId) return;

      void (async () => {
        // Copilot suggestion ignored: titles are cached in `taskCommentToastTitleByIdRef` after the first fetch per taskId (not N+1 per notification burst).
        const cached = taskCommentToastTitleByIdRef.current.get(taskCommentTaskId);
        if (cached) {
          setCommentAlert({ taskId: taskCommentTaskId, title: cached, messageId: messageId || '' });
          return;
        }
        const s = createClient();
        const { data: t } = await s
          .from('tasks')
          .select('title')
          .eq('id', taskCommentTaskId)
          .maybeSingle();
        const title = (t as { title?: string } | null)?.title;
        if (!title) return;
        taskCommentToastTitleByIdRef.current.set(taskCommentTaskId, title);
        setCommentAlert({
          taskId: taskCommentTaskId,
          title,
          messageId: messageId || '',
        });
      })();
    };

    for (const b of bubbles) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${b.id}`,
        },
        onMessageInsert,
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
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadUserWorkspaces();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadUserWorkspaces]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setAuthHasSessionEmail(Boolean(user?.email?.trim()));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    setProfileComplete(
      isDashboardProfileComplete(profile, activeWorkspace, workspaceId, authHasSessionEmail),
    );
  }, [profile, activeWorkspace, workspaceId, authHasSessionEmail]);

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
      // Persist calendar as expanded while Kanban is hidden (matches hydrate guard: k && cal → cal false).
      setCalendarCollapsedState(false);
    } else if (tab === 'board') {
      setChatCollapsedState(true);
      setKanbanCollapsedState(false);
    } else {
      setChatCollapsedState(true);
      setKanbanCollapsedState(true);
      setCalendarCollapsedState(false);
    }
  }, [layoutHydrated, embedMode, searchParams]);

  const bubbleQueryParam = searchParams.get('bubble');

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
        if (bubbleQueryParam && rows.some((b) => b.id === bubbleQueryParam)) {
          return bubbleQueryParam;
        }
        if (effectiveWorkspaceRole === 'guest' && rows.length > 0) {
          const trial = rows.find((b) => b.bubble_type === 'trial');
          if (trial) return trial.id;
          return rows[0].id;
        }
        if (prev === ALL_BUBBLES_BUBBLE_ID) return ALL_BUBBLES_BUBBLE_ID;
        if (prev && rows.some((b) => b.id === prev)) return prev;
        return ALL_BUBBLES_BUBBLE_ID;
      });
    }
    void load();
  }, [workspaceId, effectiveWorkspaceRole, bubbleQueryParam]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bubbles_metadata:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bubbles',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const next = payload.new as BubbleRow | null;
          if (!next?.id) return;
          setBubbles((prev) => prev.map((b) => (b.id === next.id ? { ...b, ...next } : b)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  useEffect(() => {
    setPendingJoinRequestCount(initialPendingJoinRequestCount);
    setJoinRequestBellPreview(initialJoinRequestPreview);
  }, [workspaceId, initialPendingJoinRequestCount, initialJoinRequestPreview]);

  useEffect(() => {
    if (!isAdmin) return;
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
  }, [workspaceId, isAdmin]);

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
    workspaceId,
    /** Badge only for admins; link is shown for all members (invites page enforces admin/owner). */
    pendingJoinRequestCount: isAdmin ? pendingJoinRequestCount : 0,
    onOpenPeopleInvites: embedMode ? undefined : openPeopleInvites,
    onOpenCreateWorkspace: embedMode ? undefined : openCreateWorkspace,
    onOpenFitnessProfile:
      !embedMode && workspaceCategoryForUi === 'fitness'
        ? () => setFitnessProfileOpen(true)
        : undefined,
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

  const trialSoftLockSurfaces = useMemo(
    () =>
      shouldSoftLockTrialSurfaces({
        activeWorkspace,
        activeBubble: storeActiveBubble,
        selectedBubbleId,
        bubbles,
      }),
    [activeWorkspace, storeActiveBubble, selectedBubbleId, bubbles],
  );

  const profilePermissionsContext = useMemo((): ProfilePermissionsContext | undefined => {
    if (embedMode) return undefined;
    return {
      workspaceName: workspaceTitle,
      workspaceRole: effectiveWorkspaceRole,
      selectedBubbleLabel: resolveBuddyBubbleDisplayTitle(
        selectedBubbleId,
        bubbles,
        activeWorkspace?.name ?? null,
      ),
      bubbleMemberRole: myBubbleRole,
      selectedBubbleIsPrivate: activeBubbleIsPrivate,
    };
  }, [
    embedMode,
    workspaceTitle,
    effectiveWorkspaceRole,
    selectedBubbleId,
    bubbles,
    activeWorkspace?.name,
    myBubbleRole,
    activeBubbleIsPrivate,
  ]);

  const bubbleSidebarProps = {
    workspaceId,
    collapsed: bubbleSidebarCollapsed,
    onCollapsedChange: setBubbleSidebarCollapsed,
    bubbles,
    selectedBubbleId,
    onSelectBubble,
    onBubblesChange: setBubbles,
    canCreateWorkspaceBubble,
    isAdmin: isAdmin,
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

  const hideMainStageForDesktopChat =
    !layoutMobile && !embedMode && desktopFocusModeActive === 'chat';

  const applyDesktopFocusMode = useCallback(
    (mode: DesktopFocusMode) => {
      if (!layoutHydrated || embedMode) return;
      switch (mode) {
        case 'chat':
          setChatCollapsedState(false);
          setKanbanCollapsedState(true);
          setWorkspaceRailCollapsed(false);
          setBubbleSidebarCollapsed(false);
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

  const dockWorkspaceGroupRef = useGroupRef();

  const [dockWorkspaceDefaultLayout, setDockWorkspaceDefaultLayout] = useState<Layout>(() => ({
    [DASH_DOCK_PANEL_ID]: 42,
    [DASH_WORKSPACE_PANEL_ID]: 58,
  }));

  const [theaterBoardDockDefaultLayout, setTheaterBoardDockDefaultLayout] = useState<Layout>(
    () => ({
      [THEATER_BOARD_PANEL_ID]: 42,
      [THEATER_DOCK_PANEL_ID]: 58,
    }),
  );

  useEffect(() => {
    setDockWorkspaceDefaultLayout(readDockWorkspaceLayout(workspaceId));
    setTheaterBoardDockDefaultLayout(readTheaterBoardDockLayout(workspaceId));
  }, [workspaceId]);

  const onPlanningVerticalLayoutChanged = useCallback(
    (layout: Layout) => {
      if (workoutDeckSelection.isSelectingFromBoard) return;
      try {
        localStorage.setItem(dockWorkspaceSplitStorageKey(workspaceId), JSON.stringify(layout));
      } catch {
        /* ignore */
      }
    },
    [workspaceId, workoutDeckSelection.isSelectingFromBoard],
  );

  const onTheaterBoardDockLayoutChanged = useCallback(
    (layout: Layout) => {
      try {
        localStorage.setItem(theaterBoardDockSplitStorageKey(workspaceId), JSON.stringify(layout));
      } catch {
        /* ignore */
      }
    },
    [workspaceId],
  );

  const handleDoneSelectingFromBoard = useCallback(() => {
    workoutDeckSelection.exitSelectionMode();
  }, [workoutDeckSelection.exitSelectionMode]);

  const calendarRailEl = useMemo(
    () => (
      <CalendarRail
        isCollapsed={calendarRailIsCollapsed}
        onExpand={() => setCalendarCollapsed(false)}
        onCollapse={() => setCalendarCollapsed(true)}
        buddyBubbleTitle={buddyBubbleTitle}
        {...calendarContext}
      />
    ),
    [buddyBubbleTitle, calendarContext, calendarRailIsCollapsed, setCalendarCollapsed],
  );

  const workspaceBoardEl = useMemo(
    () =>
      isAnalyticsBubble ? (
        <PremiumGate feature="analytics" className="flex-1 min-h-0">
          <AnalyticsBoard workspaceId={workspaceId} calendarTimezone={workspaceCalendarTz} />
        </PremiumGate>
      ) : isClassesBubble ? (
        <ClassesBoard workspaceId={workspaceId} />
      ) : isProgramsBubble ? (
        <ProgramsBoard
          workspaceId={workspaceId}
          selectedBubbleId={selectedBubbleId!}
          bubbles={bubbles}
          workspaceCategory={effectiveKanbanCategory}
          calendarTimezone={workspaceCalendarTz}
          taskViewsNonce={taskViewsNonce}
          canWrite={canWriteTasks}
          onOpenTask={openTaskModal}
          onOpenCreateTask={openCreateTaskModal}
        />
      ) : (
        <KanbanBoard
          canWrite={canWriteTasks}
          bubbles={bubbles}
          onOpenTask={openTaskModal}
          onOpenCreateTask={openCreateTaskModal}
          onStartWorkout={handleStartWorkout}
          workspaceCategory={effectiveKanbanCategory}
          calendarTimezone={workspaceCalendarTz}
          boardStripExpandNonce={boardStripExpandNonce}
          calendarStripCollapsed={calendarRailIsCollapsed}
          onExpandCalendarWhenKanbanStripCollapse={() => setCalendarCollapsed(false)}
          onRetractKanbanPanel={() => setKanbanCollapsed(true)}
          buddyBubbleTitle={buddyBubbleTitle}
          workspaceMemberRole={effectiveWorkspaceRole}
          guestTaskUserId={profile?.id ?? null}
          workoutSelectionMode={workoutDeckSelection.isSelectingFromBoard}
          onTaskSelectedForWorkoutDeck={workoutDeckSelection.addTaskToDeck}
        />
      ),
    [
      isAnalyticsBubble,
      isClassesBubble,
      isProgramsBubble,
      workspaceId,
      workspaceCalendarTz,
      selectedBubbleId,
      bubbles,
      effectiveKanbanCategory,
      taskViewsNonce,
      canWriteTasks,
      openTaskModal,
      openCreateTaskModal,
      handleStartWorkout,
      boardStripExpandNonce,
      calendarRailIsCollapsed,
      buddyBubbleTitle,
      effectiveWorkspaceRole,
      profile?.id,
      workoutDeckSelection.isSelectingFromBoard,
      workoutDeckSelection.addTaskToDeck,
      setCalendarCollapsed,
      setKanbanCollapsed,
    ],
  );

  const workspaceStage = (
    <WorkspaceMainSplit
      workspaceId={workspaceId}
      chatCollapsed={chatCollapsed}
      onChatCollapsedChange={setChatCollapsed}
      kanbanCollapsed={kanbanCollapsed}
      calendarCollapsed={calendarRailIsCollapsed}
      hideMainStage={hideMainStageForDesktopChat}
      omitCollapsedMessagesStrip={(tripleStack && chatCollapsed) || omitMobileNonChatStrip}
      hideCalendarSlot={hideCalendarForMobileBoard}
      hideMainStageBelowMd={layoutMobile && mobileTab === 'chat'}
      taskViewsNonce={taskViewsNonce}
      boardSoftLocked={trialSoftLockSurfaces}
      calendarRail={calendarRailEl}
      renderChat={({ onCollapse }) => (
        <ChatArea
          bubbles={bubbles}
          canPostMessages={canPostMessages}
          canWriteTasks={canWriteTasks}
          onOpenTask={openTaskModal}
          onOpenCreateTaskForChat={openChatComposeForTask}
          onCollapse={onCollapse}
          workspaceTitle={workspaceTitle}
          joinRequestBellPreview={isAdmin ? joinRequestBellPreview : undefined}
        />
      )}
      board={workspaceBoardEl}
    />
  );

  const workspaceBoardHorizontalStage = (
    <div
      data-workspace-kanban-stage
      className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden bg-background"
    >
      {trialSoftLockSurfaces ? (
        <TrialPaywallGuard locked className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isValidElement(workspaceBoardEl)
            ? cloneElement(
                workspaceBoardEl as ReactElement<{
                  calendarSlot?: React.ReactNode;
                  taskViewsNonce?: number;
                }>,
                {
                  calendarSlot: hideCalendarForMobileBoard ? undefined : calendarRailEl,
                  taskViewsNonce,
                },
              )
            : workspaceBoardEl}
        </TrialPaywallGuard>
      ) : isValidElement(workspaceBoardEl) ? (
        cloneElement(
          workspaceBoardEl as ReactElement<{
            calendarSlot?: React.ReactNode;
            taskViewsNonce?: number;
          }>,
          {
            calendarSlot: hideCalendarForMobileBoard ? undefined : calendarRailEl,
            taskViewsNonce,
          },
        )
      ) : (
        workspaceBoardEl
      )}
    </div>
  );

  return (
    <AnalyticsProvider workspaceId={workspaceId} userId={profile?.id}>
      <LiveSessionRuntimeProvider
        workspaceId={workspaceId}
        sessionId={activeLiveVideoSession?.sessionId ?? ''}
        localUserId={profile?.id ?? ''}
        hostUserId={activeLiveVideoSession?.hostUserId ?? ''}
        enabled={Boolean(activeLiveVideoSession && profile?.id)}
      >
        <LiveVideoSessionShell
          theaterPlanDeps={{
            hasLiveVideoSession: liveVideoSessionWithUser,
            isSelectingFromBoard: workoutDeckSelection.isSelectingFromBoard,
            layoutMobile,
            embedMode,
            layoutHydrated,
          }}
        >
          <ThemeScope category={effectiveThemeCategory}>
            <div className="flex h-screen min-h-0 flex-col bg-background md:flex-row md:overflow-hidden">
              {layoutMobile ? (
                <MobileHeader
                  title={buddyBubbleTitle}
                  trailing={embedMode ? null : <ActiveUsersStack localUserId={profile?.id} />}
                />
              ) : null}
              {layoutMobile ? (
                <MobileSidebarSheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <WorkspaceRail {...drawerRailProps} />
                  <BubbleSidebar {...drawerBubbleProps} />
                </MobileSidebarSheet>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
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
                    <div className="flex min-w-0 shrink-0 items-center gap-2">
                      {embedMode ? null : <ActiveUsersStack localUserId={profile?.id} />}
                      <DesktopViewSwitcher
                        activeMode={desktopFocusModeActive}
                        onChange={applyDesktopFocusMode}
                        disabled={!layoutHydrated}
                      />
                    </div>
                  </div>
                ) : null}
                {!embedMode && <TrialBanner />}
                {!embedMode && <ExpiredGate />}
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

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {process.env.NODE_ENV === 'development' &&
                    !embedMode &&
                    !activeLiveVideoSession &&
                    profile?.id ? (
                      <div className="flex shrink-0 justify-end border-b border-border bg-muted/30 px-2 py-1">
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={handleJoinDevLiveVideo}
                        >
                          Start live video (dev)
                        </Button>
                      </div>
                    ) : null}
                    {activeLiveVideoSession && profile?.id ? (
                      <LiveTheaterPlanBranch>
                        {(plan) => {
                          const shellKind =
                            plan.shell.kind !== 'inactive'
                              ? plan.shell.kind
                              : layoutMobile || embedMode
                                ? 'vertical_compact_session'
                                : 'vertical_planning';

                          if (
                            shellKind === 'vertical_planning' ||
                            shellKind === 'vertical_compact_session'
                          ) {
                            return (
                              <ResizablePanelGroup
                                key={`${workspaceId}-lv-plan`}
                                direction="vertical"
                                groupRef={dockWorkspaceGroupRef}
                                id={`dock-workspace-split-${workspaceId}`}
                                defaultLayout={dockWorkspaceDefaultLayout}
                                onLayoutChanged={onPlanningVerticalLayoutChanged}
                                disabled={layoutMobile || embedMode}
                                className="flex min-h-0 min-w-0 flex-1 flex-col"
                              >
                                <ResizablePanel
                                  id={DASH_DOCK_PANEL_ID}
                                  minSize={200}
                                  maxSize="75%"
                                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                                >
                                  <DashboardLiveVideoDock
                                    session={activeLiveVideoSession}
                                    localUserId={profile.id}
                                    onLeaveSession={onLiveVideoLeaveSession}
                                    canWriteTasks={canWriteTasks}
                                    onWorkoutDeckPersisted={bumpTaskViews}
                                  />
                                </ResizablePanel>
                                <ResizableHandle
                                  direction="vertical"
                                  withHandle
                                  className="z-20 shrink-0"
                                />
                                <ResizablePanel
                                  id={DASH_WORKSPACE_PANEL_ID}
                                  minSize={300}
                                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                                >
                                  {workspaceStage}
                                </ResizablePanel>
                              </ResizablePanelGroup>
                            );
                          }

                          if (shellKind === 'theater_focus') {
                            return (
                              <div
                                key={`${workspaceId}-lv-theater-focus`}
                                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                              >
                                <DashboardLiveVideoDock
                                  session={activeLiveVideoSession}
                                  localUserId={profile.id}
                                  onLeaveSession={onLiveVideoLeaveSession}
                                  canWriteTasks={canWriteTasks}
                                  onWorkoutDeckPersisted={bumpTaskViews}
                                />
                              </div>
                            );
                          }

                          if (shellKind === 'theater_board_split') {
                            return (
                              <ResizablePanelGroup
                                key={`${workspaceId}-lv-theater-board-dock`}
                                direction="horizontal"
                                groupRef={dockWorkspaceGroupRef}
                                id={`theater-board-dock-${workspaceId}`}
                                defaultLayout={theaterBoardDockDefaultLayout}
                                onLayoutChanged={onTheaterBoardDockLayoutChanged}
                                className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row"
                              >
                                <ResizablePanel
                                  id={THEATER_BOARD_PANEL_ID}
                                  minSize={280}
                                  maxSize="70%"
                                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                                >
                                  {workspaceBoardHorizontalStage}
                                </ResizablePanel>
                                <ResizableHandle
                                  direction="horizontal"
                                  withHandle
                                  className="z-20 shrink-0"
                                />
                                <ResizablePanel
                                  id={THEATER_DOCK_PANEL_ID}
                                  minSize={200}
                                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                                >
                                  <DashboardLiveVideoDock
                                    session={activeLiveVideoSession}
                                    localUserId={profile.id}
                                    onLeaveSession={onLiveVideoLeaveSession}
                                    canWriteTasks={canWriteTasks}
                                    onWorkoutDeckPersisted={bumpTaskViews}
                                  />
                                </ResizablePanel>
                              </ResizablePanelGroup>
                            );
                          }

                          return null;
                        }}
                      </LiveTheaterPlanBranch>
                    ) : (
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        {workspaceStage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {layoutMobile ? (
                <MobileTabBar onOpenNavigation={() => setMobileNavOpen(true)} />
              ) : null}

              <TaskModal
                open={taskModalOpen}
                onOpenChange={onTaskModalOpenChange}
                taskId={taskModalTaskId}
                bubbleId={resolvedTaskModalBubbleId}
                workspaceId={workspaceId}
                bubbles={bubbles}
                canWrite={canWriteTasks}
                onCreated={(id) => {
                  setTaskModalTaskId(id);
                  bumpTaskViews();
                  const postToChat = chatCardOnCreatedRef.current;
                  chatCardOnCreatedRef.current = null;
                  if (postToChat) postToChat(id);
                }}
                initialCreateStatus={taskModalInitialStatus}
                initialCreateItemType={taskModalInitialCreateItemType}
                initialCreateTitle={taskModalInitialCreateTitle}
                initialCreateWorkoutDurationMin={taskModalInitialCreateWorkoutDurationMin}
                initialTab={taskModalInitialTab}
                initialViewMode={taskModalViewMode}
                initialAutoEdit={taskModalAutoEdit}
                initialOpenWorkoutViewer={taskModalOpenWorkoutViewer}
                initialCommentThreadMessageId={taskModalCommentThreadMessageId}
                workspaceCategory={effectiveKanbanCategory}
                calendarTimezone={workspaceCalendarTz}
                onTaskArchived={bumpTaskViews}
                onTaskCommentsMarkedRead={bumpTaskViews}
                onClearOpenTaskCommentDeepLink={clearTaskModalCommentDeepLink}
              />
              {workoutPlayerTask && (
                <WorkoutPlayer
                  open
                  onClose={() => setWorkoutPlayerTask(null)}
                  workspaceId={workspaceId}
                  workoutTitle={workoutPlayerTask.title}
                  exercises={metadataFieldsFromParsed(workoutPlayerTask.metadata).workoutExercises}
                  bubbleId={workoutPlayerTask.bubble_id}
                  sourceTaskId={workoutPlayerTask.id}
                  onComplete={bumpTaskViews}
                />
              )}
              <WorkspaceSettingsModal
                open={workspaceSettingsOpen}
                onOpenChange={setWorkspaceSettingsOpen}
                workspaceId={workspaceId}
                isAdmin={isAdmin}
                isOwner={isOwner}
                onSaved={() => {
                  void loadUserWorkspaces().then(() => syncActiveFromRoute(workspaceId));
                }}
              />
              <ProfileModal
                open={profileModalOpen}
                onOpenChange={setProfileModalOpen}
                permissionsContext={profilePermissionsContext}
                showFamilyNames={showFamilyNames}
              />
              {/* Modal requires `profile`; `isDashboardProfileComplete` treats null profile as gate-off while store loads */}
              {!profileComplete && profile !== null ? (
                <ProfileCompletionModal
                  profile={profile}
                  showFamilyNames={showFamilyNames}
                  workspaceId={workspaceId}
                  onComplete={() => void loadProfile()}
                />
              ) : null}
              <PeopleInvitesModal
                open={peopleInvitesOpen}
                onOpenChange={setPeopleInvitesOpen}
                workspaceId={workspaceId}
                themeCategory={effectiveThemeCategory}
                preferPendingTab={pendingJoinRequestCount > 0}
                onRequestCreateOwnWorkspace={embedMode ? undefined : openCreateWorkspace}
              />
              {!embedMode ? (
                <CreateWorkspaceModal
                  open={createWorkspaceOpen}
                  onOpenChange={setCreateWorkspaceOpen}
                />
              ) : null}
              {workspaceCategoryForUi === 'fitness' ? (
                <FitnessProfileSheet
                  open={fitnessProfileOpen}
                  onOpenChange={setFitnessProfileOpen}
                  workspaceId={workspaceId}
                  bubbleIdForTasks={
                    selectedBubbleId && selectedBubbleId !== ALL_BUBBLES_BUBBLE_ID
                      ? selectedBubbleId
                      : null
                  }
                  onQuickWorkoutCreated={bumpTaskViews}
                />
              ) : null}
              {workspaceCategoryForUi === 'fitness' || workspaceCategoryForUi === 'business' ? (
                <StartTrialModal workspaceId={workspaceId} categoryType={workspaceCategoryForUi} />
              ) : null}
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
                      openTaskModal(commentAlert.taskId, {
                        tab: 'comments',
                        viewMode: 'comments-only',
                        commentThreadMessageId: commentAlert.messageId || undefined,
                      });
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
              {workoutDeckSelection.isSelectingFromBoard ? (
                <Button
                  type="button"
                  className="fixed bottom-24 left-4 z-[200] shadow-md md:bottom-6 md:left-6"
                  onClick={handleDoneSelectingFromBoard}
                >
                  Done selecting
                </Button>
              ) : null}
              {children}
            </div>
          </ThemeScope>
        </LiveVideoSessionShell>
      </LiveSessionRuntimeProvider>
    </AnalyticsProvider>
  );
}

export function DashboardShell(props: Props) {
  return (
    <WorkoutDeckSelectionProvider>
      <DashboardShellInner {...props} />
    </WorkoutDeckSelectionProvider>
  );
}
