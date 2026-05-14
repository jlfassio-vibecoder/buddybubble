'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Dumbbell, X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { BubbleMemberRole, BubbleRow, ItemType, Json, TaskRow } from '@/types/database';
import {
  ALL_BUBBLES_BUBBLE_ID,
  makeAllBubblesBubbleRow,
  resolveBuddyBubbleDisplayTitle,
} from '@/lib/all-bubbles';
import { NARROW_MAX_QUERY } from '@/lib/viewport';
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
import { createDraftTask } from '@/components/modals/task-modal/hooks/useTaskDraftCreate';
import type { TaskDraftBaseline } from '@/components/modals/task-modal/task-draft-types';
import { WorkspaceSettingsModal } from '@/components/modals/WorkspaceSettingsModal';
import { PeopleInvitesModal } from '@/components/modals/PeopleInvitesModal';
import { CreateWorkspaceModal } from '@/components/modals/CreateWorkspaceModal';
import { ProfileModal, type ProfilePermissionsContext } from '@/components/modals/ProfileModal';
import { ProfileCompletionModal } from '@/components/modals/ProfileCompletionModal';
import { AnalyticsBoard } from '@/components/fitness/AnalyticsBoard';
import { ClassesBoard } from '@/components/fitness/ClassesBoard';
import { ProgramsBoard } from '@/components/fitness/ProgramsBoard';
import { WorkoutPlayer } from '@/components/fitness/WorkoutPlayer';
import { FitnessProfileSheet } from '@/components/fitness/FitnessProfileSheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { markLiveSessionInviteMessageEnded } from '@/lib/mark-live-session-invite-ended';
import { WorkspaceSessionProvider } from '@/context/WorkspaceSessionContext';
import {
  markClassInstanceLiveSessionEnded,
  markTaskLiveSessionEnded,
} from '@/lib/mark-card-live-session-ended';
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
import { MobileShellProvider, useMobileShellState } from '@/hooks/use-mobile-shell-state';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileSidebarSheet } from '@/components/layout/MobileSidebarSheet';
import { MobileWorkspaceStrip } from '@/components/layout/MobileWorkspaceStrip';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import {
  DesktopViewSwitcher,
  type DesktopFocusMode,
} from '@/components/layout/desktop-view-switcher';
import {
  LayoutCommandContext,
  type LayoutCommands,
} from '@/components/layout/layout-command-context';
import type { MemberRole } from '@/types/database';
import { parseMemberRole } from '@/lib/permissions';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdatePresence } from '@/hooks/use-update-presence';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import {
  DashboardLiveVideoDockBody,
  DashboardLiveVideoDockProvider,
} from '@/components/dashboard/dashboard-live-video-dock';
import {
  WorkoutDeckSelectionProvider,
  useWorkoutDeckSelection,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import {
  dispatchWorkoutDeckTaskFromBoard,
  useWorkoutDeckBoardSelecting,
} from '@/features/live-video/shells/huddle/workout-deck-board-bridge';
import {
  StandaloneClassDeckBuilder,
  isValidClassInstanceIdForDeckBuilder,
} from '@/features/live-video/shells/huddle/StandaloneClassDeckBuilder';
import { AsyncPlaybackShell } from '@/features/live-video/shells/AsyncPlaybackShell';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';
import { TrialPaywallGuard } from '@/components/subscription/trial-paywall-guard';
import { LiveSessionRuntimeProvider } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import type { LiveTheaterLayoutPlan } from '@/features/live-video/theater/live-theater-layout.types';
import { LiveVideoSessionShell } from '@/features/live-video/theater/live-video-session-shell';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { FloatingMediaBar } from '@/features/live-video/ui/FloatingMediaBar';
import { JOIN_LIVE_CLASS_PARAM } from '@/lib/class-links';
import { isDashboardProfileComplete } from '@/lib/profile-helpers';
import { useStorefrontTrialWorkoutAutoOpen } from '@/hooks/use-storefront-trial-workout-auto-open';
import {
  shouldBlockWorkoutForExpiredMemberPreview,
  shouldSoftLockTrialSurfaces,
} from '@/lib/member-trial-soft-lock';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import { TrialBanner } from '@/components/subscription/trial-banner';
import { ExpiredGate } from '@/components/subscription/expired-gate';
import { StartTrialModal } from '@/components/subscription/start-trial-modal';
import { LiveClassReminderModal } from '@/components/dashboard/LiveClassReminderModal';
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
  initialBubbles?: BubbleRow[];
  children: React.ReactNode;
};

/** Mic/camera for host live-deck pick mode; must render under hoisted `AgoraSessionProvider`. */
function LiveDeckBoardSelectionMediaBar() {
  const { isMicMuted, isCameraOff, toggleMic, toggleCamera } = useAgoraSession();
  return (
    <FloatingMediaBar
      isMicMuted={isMicMuted}
      isCameraOff={isCameraOff}
      onToggleMic={toggleMic}
      onToggleCamera={toggleCamera}
      className="relative bottom-auto left-auto mx-auto translate-x-0"
    />
  );
}

function DashboardShellInner({
  workspaceId,
  initialRole,
  initialPendingJoinRequestCount = 0,
  initialJoinRequestPreview = [],
  initialBubbles = [],
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const embedMode = searchParams.get('embed') === 'true';
  const urlTab = searchParams.get('tab');
  const urlView = searchParams.get('view');
  const narrowViewport = useIsNarrowBelowMd();
  const layoutMobile = !embedMode && narrowViewport;
  const mobileShell = useMobileShellState();
  const mobileTab = mobileShell.tab;
  const mobileNavOpen = mobileShell.drawerOpen;
  const setMobileNavOpen = mobileShell.setDrawerOpen;

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

  // Copilot suggestion ignored: the useEffect at the bubbles-load block also derives `selectedBubbleId` from `bubbleQueryParam` + `effectiveWorkspaceRole`; short-circuiting the fetch when `initialBubbles` is present would require splitting that effect, which is a refactor outside this PR's surgical scope.
  const [bubbles, setBubbles] = useState<BubbleRow[]>(initialBubbles);
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
  /** Edit `class_instances` in TaskModal (`ClassEditor`) without a `tasks` row. */
  const [taskModalClassEditorInstanceId, setTaskModalClassEditorInstanceId] = useState<
    string | null
  >(null);
  /** Phase 3.8: optimistic `tasks` insert before modal open; cleared after first save or on close. */
  const [taskModalOptimisticDraft, setTaskModalOptimisticDraft] = useState(false);
  const [taskModalDraftBaseline, setTaskModalDraftBaseline] = useState<TaskDraftBaseline | null>(
    null,
  );
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  /** `null` = session email not resolved yet (avoid treating legacy users as incomplete during fetch). */
  const [authHasSessionEmail, setAuthHasSessionEmail] = useState<boolean | null>(null);
  const [peopleInvitesOpen, setPeopleInvitesOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [fitnessProfileOpen, setFitnessProfileOpen] = useState(false);
  const [fitnessProfileTargetUserId, setFitnessProfileTargetUserId] = useState<string | null>(null);
  const [commentAlert, setCommentAlert] = useState<{
    taskId: string;
    title: string;
    messageId: string;
  } | null>(null);
  type WorkoutPlayerLaunchPayload = {
    task: TaskRow;
    sessionId: string | null;
    class_instance_id: string | null;
    isMemberView: true;
    workoutData?: Json;
  };
  const [workoutPlayerLaunch, setWorkoutPlayerLaunch] = useState<WorkoutPlayerLaunchPayload | null>(
    null,
  );
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
  const workoutBoardSelecting = useWorkoutDeckBoardSelecting();

  const bumpTaskViews = useCallback(() => setTaskViewsNonce((n) => n + 1), []);

  /** Clears chat deep-link open options so TaskModal tab routing cannot re-apply Comments from stale props. */
  const clearTaskModalCommentDeepLink = useCallback(() => {
    setTaskModalCommentThreadMessageId(null);
    setTaskModalInitialTab(null);
    setTaskModalViewMode('full');
  }, []);

  const openPeopleInvites = useCallback(() => {
    setPeopleInvitesOpen(true);
    if (layoutMobile) {
      mobileShell.setDrawerOpen(false);
    }
  }, [layoutMobile, mobileShell]);

  /** Drawer is mobile-only chrome; clear open state when leaving narrow layout so it cannot reopen spuriously. */
  useEffect(() => {
    if (!layoutMobile) {
      setMobileNavOpen(false);
    }
  }, [layoutMobile, setMobileNavOpen]);

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

  const boardColumnDefsForDraft = useBoardColumnDefs(workspaceId);
  const hasTodayBoardColumnForDraft = useMemo(
    () => boardColumnDefsForDraft?.some((c) => c.id === 'today') ?? false,
    [boardColumnDefsForDraft],
  );
  const hasScheduledBoardColumnForDraft = useMemo(
    () => boardColumnDefsForDraft?.some((c) => c.id === 'scheduled') ?? false,
    [boardColumnDefsForDraft],
  );

  const fitnessScopeForStorefrontAutoOpen = useMemo((): 'unknown' | 'yes' | 'no' => {
    if (activeWorkspace?.id !== workspaceId) return 'unknown';
    return activeWorkspace.category_type === 'fitness' ? 'yes' : 'no';
  }, [activeWorkspace, workspaceId]);

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
  const taskModalFocusMessagesOnCloseRef = useRef(false);
  const taskModalForToastRef = useRef<{ open: boolean; taskId: string | null }>({
    open: false,
    taskId: null,
  });
  const taskCommentToastTitleByIdRef = useRef<Map<string, string>>(new Map());
  /** One-time desktop rail collapse per live session join (user can expand rails again). */
  const liveVideoTheaterRailsPrimedForSessionIdRef = useRef<string | null>(null);
  /** One-time per workspace: after hydrate, force bubbles rail open on desktop when landing in Messages focus. */
  const didDesktopMessagesBubbleForceRef = useRef(false);
  /** Prevents overlapping `join_live_class` deep-link handlers (e.g. React Strict Mode double mount). */
  const joinLiveClassDeepLinkInFlightRef = useRef(false);

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

  const canManageWorkspaceClasses = useMemo(
    () => effectiveWorkspaceRole === 'owner' || effectiveWorkspaceRole === 'admin',
    [effectiveWorkspaceRole],
  );

  useEffect(() => {
    const uid = profile?.id ?? null;
    if (!uid) {
      setFitnessProfileTargetUserId(null);
      return;
    }
    if (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID || selectedBubbleId == null) {
      setFitnessProfileTargetUserId(null);
      return;
    }
    if (!activeBubbleIsPrivate) {
      setFitnessProfileTargetUserId(null);
      return;
    }
    if (!isAdmin && !isOwner) {
      setFitnessProfileTargetUserId(null);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    void supabase
      .from('bubble_members')
      .select('user_id')
      .eq('bubble_id', selectedBubbleId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setFitnessProfileTargetUserId(null);
          return;
        }
        const others = (data as Array<{ user_id?: string | null }>).map((r) => r.user_id ?? null);
        const cleaned = others
          .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
          .filter((id) => id !== uid);
        setFitnessProfileTargetUserId(cleaned.length === 1 ? cleaned[0] : null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBubbleIsPrivate, isAdmin, isOwner, profile?.id, selectedBubbleId]);

  useUpdatePresence({ embedMode, workspaceId });

  const initSubscription = useSubscriptionStore((s) => s.initSubscription);
  useEffect(() => {
    void initSubscription(workspaceId);
  }, [workspaceId, initSubscription]);

  const activeLiveVideoSession = useLiveVideoStore((s) => s.activeSession);
  const joinLiveVideoSession = useLiveVideoStore((s) => s.joinSession);

  const classDeckBuilderParam = searchParams.get('class_deck_builder')?.trim() ?? '';
  const showClassDeckBuilder =
    !embedMode &&
    !activeLiveVideoSession &&
    canManageWorkspaceClasses &&
    isValidClassInstanceIdForDeckBuilder(classDeckBuilderParam);

  const classAsyncPlayerParam = searchParams.get('class_async_player')?.trim() ?? '';
  /** Profile optional here so the query param survives auth hydration; shell shows a sign-in prompt if needed. */
  const showClassAsyncPlayerBase =
    !embedMode &&
    !activeLiveVideoSession &&
    isValidClassInstanceIdForDeckBuilder(classAsyncPlayerParam);
  /** Admin class deck builder takes precedence when both query params are present. */
  const showClassAsyncPlayer = showClassAsyncPlayerBase && !showClassDeckBuilder;

  useEffect(() => {
    if (activeLiveVideoSession && activeLiveVideoSession.workspaceId !== workspaceId) {
      workoutDeckSelection.exitSelectionMode();
      useLiveVideoStore.getState().leaveSession();
    }
  }, [activeLiveVideoSession, workspaceId, workoutDeckSelection]);

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
    setWorkspaceRailCollapsed,
    setBubbleSidebarCollapsed,
    setChatCollapsed,
  ]);

  /** Expand Kanban while picking cards into the workout deck (session UX; not theater collapse hacks). */
  useEffect(() => {
    if (!layoutHydrated) return;
    if (!workoutBoardSelecting) return;
    setKanbanCollapsed(false);
  }, [layoutHydrated, workoutBoardSelecting, setKanbanCollapsed]);

  const layoutCommands = useMemo((): LayoutCommands => {
    return {
      focusMessages: () => {
        if (!layoutHydrated || embedMode) return;
        if (layoutMobile) {
          mobileShell.setTab('chat');
          return;
        }
        setChatCollapsedState(false);
        setKanbanCollapsedState(true);
        setWorkspaceRailCollapsed(false);
        setBubbleSidebarCollapsed(false);
      },
      focusBoard: () => {
        if (!layoutHydrated || embedMode) return;
        if (layoutMobile) {
          mobileShell.setTab('board');
          return;
        }
        setChatCollapsedState(true);
        setKanbanCollapsedState(false);
        setCalendarCollapsedState(true);
        setBoardStripExpandNonce((n) => n + 1);
      },
      focusCalendar: () => {
        if (!layoutHydrated || embedMode) return;
        if (layoutMobile) {
          mobileShell.setTab('calendar');
          return;
        }
        setChatCollapsedState(true);
        setKanbanCollapsedState(true);
        setCalendarCollapsedState(false);
      },
      focusSplit: () => {
        if (!layoutHydrated || embedMode) return;
        if (layoutMobile) {
          /** No split tab on mobile; board is the closest multi-pane surface. */
          mobileShell.setTab('board');
          return;
        }
        setChatCollapsedState(false);
        setKanbanCollapsedState(false);
        setCalendarCollapsedState(true);
        setBoardStripExpandNonce((n) => n + 1);
      },
    };
  }, [embedMode, layoutHydrated, layoutMobile, mobileShell]);

  const clearClassDeckBuilder = useCallback(() => {
    workoutDeckSelection.exitSelectionMode();
    const q = new URLSearchParams(searchParams.toString());
    q.delete('class_deck_builder');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, workoutDeckSelection]);

  const clearClassAsyncPlayer = useCallback(() => {
    workoutDeckSelection.exitSelectionMode();
    const q = new URLSearchParams(searchParams.toString());
    q.delete('class_async_player');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, workoutDeckSelection]);

  useEffect(() => {
    if (!classDeckBuilderParam) return;
    const allowed =
      !embedMode &&
      canManageWorkspaceClasses &&
      !activeLiveVideoSession &&
      isValidClassInstanceIdForDeckBuilder(classDeckBuilderParam);
    if (allowed) return;
    const q = new URLSearchParams(searchParams.toString());
    if (!q.has('class_deck_builder')) return;
    q.delete('class_deck_builder');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    activeLiveVideoSession,
    canManageWorkspaceClasses,
    classDeckBuilderParam,
    embedMode,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (!classAsyncPlayerParam) return;
    if (showClassAsyncPlayer) return;
    const q = new URLSearchParams(searchParams.toString());
    if (!q.has('class_async_player')) return;
    q.delete('class_async_player');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    classAsyncPlayerParam,
    embedMode,
    activeLiveVideoSession,
    pathname,
    router,
    searchParams,
    showClassAsyncPlayer,
    showClassDeckBuilder,
  ]);

  /** Deep link: ?join_live_class= — fetch instance metadata, dispatch live join, strip param via history (avoids stale router/searchParams after await). */
  useEffect(() => {
    const instanceId = searchParams.get(JOIN_LIVE_CLASS_PARAM)?.trim() ?? '';
    if (!instanceId) return;

    const stripJoinLiveClassParam = () => {
      if (typeof window === 'undefined') return;
      const u = new URL(window.location.href);
      if (!u.searchParams.has(JOIN_LIVE_CLASS_PARAM)) return;
      u.searchParams.delete(JOIN_LIVE_CLASS_PARAM);
      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState(window.history.state, '', next);
    };

    if (!isValidClassInstanceIdForDeckBuilder(instanceId)) {
      stripJoinLiveClassParam();
      return;
    }

    if (joinLiveClassDeepLinkInFlightRef.current) return;
    joinLiveClassDeepLinkInFlightRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('class_instances')
          .select('id, workspace_id, metadata')
          .eq('id', instanceId)
          .maybeSingle();

        if (cancelled) return;
        if (error || !data) {
          stripJoinLiveClassParam();
          return;
        }
        const row = data as { id: string; workspace_id?: string | null; metadata?: unknown };
        if (row.workspace_id !== workspaceId) {
          stripJoinLiveClassParam();
          return;
        }
        const invite = parseLiveSessionInviteFromMessageMetadata(row.metadata);
        if (invite && !invite.endedAt && invite.workspaceId === workspaceId) {
          joinLiveVideoSession({
            workspaceId: invite.workspaceId,
            sessionId: invite.sessionId,
            channelId: invite.channelId,
            hostUserId: invite.hostUserId,
            mode: invite.mode,
            sourceInstanceId: row.id,
          });
        }
        stripJoinLiveClassParam();
      } finally {
        joinLiveClassDeepLinkInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      joinLiveClassDeepLinkInFlightRef.current = false;
    };
  }, [searchParams, workspaceId, joinLiveVideoSession]);

  /** Class deck builder replaces the main stage; on mobile the board tab must be active to show it. */
  useEffect(() => {
    if (!showClassDeckBuilder || !layoutMobile || embedMode) return;
    if (searchParams.get('tab') === 'board') return;
    mobileShell.setTab('board');
  }, [embedMode, layoutMobile, mobileShell, searchParams, showClassDeckBuilder]);

  /** Async playback shell uses the same main-stage slot as the deck builder. */
  useEffect(() => {
    if (!showClassAsyncPlayer || !layoutMobile || embedMode) return;
    if (searchParams.get('tab') === 'board') return;
    mobileShell.setTab('board');
  }, [embedMode, layoutMobile, mobileShell, searchParams, showClassAsyncPlayer]);

  const applyDesktopFocusMode = useCallback(
    (mode: DesktopFocusMode) => {
      switch (mode) {
        case 'chat':
          layoutCommands.focusMessages();
          break;
        case 'board':
          layoutCommands.focusBoard();
          break;
        case 'calendar':
          layoutCommands.focusCalendar();
          break;
        case 'split':
          layoutCommands.focusSplit();
          break;
        default:
          break;
      }
    },
    [layoutCommands],
  );

  const onDesktopSwitcherBeforeSelectChat = useCallback(() => {
    setBubbleSidebarCollapsed(false);
    try {
      localStorage.setItem(bubbleSidebarCollapsedStorageKey(workspaceId), '0');
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  /** Clears the local live-video dock only (does not end the workout for others or mark the chat invite ended). */
  const onLiveVideoLeaveSession = useCallback(() => {
    workoutDeckSelection.exitSelectionMode();
    layoutCommands.focusMessages();
    useLiveVideoStore.getState().leaveSession();
  }, [layoutCommands, workoutDeckSelection]);

  /** Host-only: broadcast `endSession` + mark the chat invite ended so others cannot re-join from the card. */
  const onHostEndLiveSessionForAll = useCallback(async () => {
    const { activeSession } = useLiveVideoStore.getState();
    const inviteMessageId = activeSession?.inviteMessageId?.trim() ?? '';
    const sourceTaskId = activeSession?.sourceTaskId?.trim() ?? '';
    const sourceInstanceId = activeSession?.sourceInstanceId?.trim() ?? '';
    const uid = profile?.id;

    if (!uid || activeSession?.hostUserId !== uid) return;

    const supabase = createClient();
    if (sourceInstanceId) {
      try {
        const { error: fnError, data } = await supabase.functions.invoke('agora-recording-stop', {
          body: { classInstanceId: sourceInstanceId },
        });
        if (
          fnError ||
          (data &&
            typeof data === 'object' &&
            'ok' in data &&
            (data as { ok?: boolean }).ok === false)
        ) {
          console.error('[Recording] Failed to stop Agora recording.');
        }
      } catch {
        console.error('[Recording] Failed to stop Agora recording.');
      }
    }
    if (inviteMessageId) {
      await markLiveSessionInviteMessageEnded(supabase, inviteMessageId);
      return;
    }
    if (sourceTaskId) {
      await markTaskLiveSessionEnded(supabase, sourceTaskId);
      return;
    }
    if (sourceInstanceId) {
      await markClassInstanceLiveSessionEnded(supabase, sourceInstanceId);
    }
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
    taskModalFocusMessagesOnCloseRef.current = opts?.focusMessagesOnClose === true;
    chatCardOnCreatedRef.current = null;
    setTaskModalInitialCreateItemType(null);
    setTaskModalInitialCreateTitle(null);
    setTaskModalInitialCreateWorkoutDurationMin(null);
    setTaskModalCreateBubbleId(null);
    setTaskModalClassEditorInstanceId(null);
    setTaskModalOptimisticDraft(false);
    setTaskModalDraftBaseline(null);
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
    async (opts?: {
      status?: string;
      itemType?: ItemType;
      title?: string;
      workoutDurationMin?: string | null;
      bubbleId?: string | null;
      /** When set with `itemType: 'class'`, opens `ClassEditor` in edit mode for this instance. */
      classEditorInstanceId?: string | null;
      /** When true, do not clear `chatCardOnCreatedRef` (caller just set it for chat compose). */
      preserveChatCallback?: boolean;
      /** When true, closing the modal may refocus Messages (e.g. chat compose). */
      focusMessagesOnClose?: boolean;
    }) => {
      taskModalFocusMessagesOnCloseRef.current = opts?.focusMessagesOnClose === true;
      if (!opts?.preserveChatCallback) {
        chatCardOnCreatedRef.current = null;
      }

      const isClassFlow =
        opts?.itemType === 'class' || Boolean(opts?.classEditorInstanceId?.trim());

      if (isClassFlow) {
        setTaskModalOptimisticDraft(false);
        setTaskModalDraftBaseline(null);
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
        setTaskModalClassEditorInstanceId(opts?.classEditorInstanceId ?? null);
        setTaskModalOpen(true);
        return;
      }

      if (!canWriteTasks) {
        toast.error('You do not have permission to create tasks in this bubble.');
        return;
      }

      const resolvedBubbleId =
        opts?.bubbleId ??
        (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID ? (bubbles[0]?.id ?? null) : selectedBubbleId);

      if (!resolvedBubbleId) {
        toast.error('Select a bubble before creating a task.');
        return;
      }

      const itemType = opts?.itemType ?? 'task';
      const draft = await createDraftTask({
        bubbleId: resolvedBubbleId,
        workspaceId,
        itemType,
        statusSlug: opts?.status ?? null,
        title: opts?.title ?? null,
        workoutDurationMin: opts?.workoutDurationMin ?? null,
        calendarTimezone: workspaceCalendarTz,
        hasTodayBoardColumn: hasTodayBoardColumnForDraft,
        hasScheduledBoardColumn: hasScheduledBoardColumnForDraft,
      });

      if (!draft.ok) {
        toast.error(draft.error.message || 'Could not create draft. Please try again.');
        return;
      }

      setTaskModalInitialStatus(opts?.status ?? null);
      setTaskModalInitialTab(null);
      setTaskModalViewMode('full');
      setTaskModalAutoEdit(false);
      setTaskModalOpenWorkoutViewer(false);
      setTaskModalCommentThreadMessageId(null);
      setTaskModalInitialCreateItemType(opts?.itemType ?? null);
      setTaskModalInitialCreateTitle(opts?.title ?? null);
      setTaskModalInitialCreateWorkoutDurationMin(
        opts?.workoutDurationMin !== undefined ? opts.workoutDurationMin : null,
      );
      setTaskModalCreateBubbleId(opts?.bubbleId ?? null);
      setTaskModalClassEditorInstanceId(null);
      setTaskModalTaskId(draft.id);
      setTaskModalDraftBaseline(draft.baseline);
      setTaskModalOptimisticDraft(true);

      const postToChat = chatCardOnCreatedRef.current;
      if (postToChat) {
        postToChat(draft.id);
        chatCardOnCreatedRef.current = null;
      }

      bumpTaskViews();
      setTaskModalOpen(true);
    },
    [
      bumpTaskViews,
      bubbles,
      canWriteTasks,
      hasScheduledBoardColumnForDraft,
      hasTodayBoardColumnForDraft,
      selectedBubbleId,
      workspaceCalendarTz,
      workspaceId,
    ],
  );

  const openChatComposeForTask = useCallback(
    (opts: { bubbleId: string | null; onTaskCreated: (taskId: string) => void }) => {
      chatCardOnCreatedRef.current = opts.onTaskCreated;
      openCreateTaskModal({
        bubbleId: opts.bubbleId,
        preserveChatCallback: true,
        focusMessagesOnClose: true,
      });
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
      const workoutData = metadataFieldsFromParsed(task.metadata ?? {})
        .workoutExercises as unknown as Json;
      setWorkoutPlayerLaunch({
        task,
        sessionId: null,
        class_instance_id: null,
        isMemberView: true,
        workoutData,
      });
    },
    [activeWorkspace, bubbles, openTrialModal],
  );

  const handleStartWorkoutFromClass = useCallback(
    (payload: { task: TaskRow; sessionId: string; class_instance_id: string }) => {
      const { task, sessionId, class_instance_id } = payload;
      if (shouldBlockWorkoutForExpiredMemberPreview(task.bubble_id, activeWorkspace, bubbles)) {
        openTrialModal();
        return;
      }
      const workoutData = metadataFieldsFromParsed(task.metadata ?? {})
        .workoutExercises as unknown as Json;
      setWorkoutPlayerLaunch({
        task,
        sessionId,
        class_instance_id,
        isMemberView: true,
        workoutData,
      });
    },
    [activeWorkspace, bubbles, openTrialModal],
  );

  useStorefrontTrialWorkoutAutoOpen({
    workspaceId,
    fitnessScope: fitnessScopeForStorefrontAutoOpen,
    layoutHydrated,
    userId: profile?.id,
    selectedBubbleId,
    bubbles,
    openTaskModal,
  });

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

  const onTaskModalOpenChange = useCallback(
    (open: boolean) => {
      setTaskModalOpen(open);
      if (!open) {
        if (taskModalFocusMessagesOnCloseRef.current) {
          layoutCommands.focusMessages();
        }
        taskModalFocusMessagesOnCloseRef.current = false;
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
        setTaskModalClassEditorInstanceId(null);
        setTaskModalOptimisticDraft(false);
        setTaskModalDraftBaseline(null);
      }
    },
    [layoutCommands],
  );

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
    const urlChatOverride =
      !embedMode && (urlTab === 'chat' || urlView?.toLowerCase() === 'messages');

    try {
      const w = localStorage.getItem(workspaceRailCollapsedStorageKey(workspaceId));
      const b = localStorage.getItem(bubbleSidebarCollapsedStorageKey(workspaceId));
      const cRaw = localStorage.getItem(chatCollapsedStorageKey(workspaceId));
      const kRaw = localStorage.getItem(kanbanCollapsedStorageKey(workspaceId));
      const calRaw = localStorage.getItem(calendarCollapsedStorageKey(workspaceId));
      const isFreshLayoutPrefs = cRaw === null && kRaw === null && calRaw === null;

      let chatOn: boolean;
      let k: boolean;
      let cal: boolean;

      if (urlChatOverride) {
        /** Deep link: messages rail open, kanban collapsed, calendar strip expanded (ignore localStorage for these). */
        chatOn = false;
        k = true;
        cal = false;
        try {
          localStorage.setItem(chatCollapsedStorageKey(workspaceId), '0');
          localStorage.setItem(kanbanCollapsedStorageKey(workspaceId), '1');
          localStorage.setItem(calendarCollapsedStorageKey(workspaceId), '0');
        } catch {
          /* ignore */
        }
      } else if (isFreshLayoutPrefs) {
        /** First visit: default to desktop "chat focus" — messages open, kanban collapsed, calendar expanded. */
        chatOn = false;
        k = true;
        cal = false;
      } else {
        let kParsed = kRaw === '1';
        chatOn = cRaw === '1';
        if (chatOn && kParsed) kParsed = false;
        k = kParsed;
        cal = calRaw === '1';
        /** Kanban hidden + calendar strip = blank main stage; open calendar. */
        if (k && cal) cal = false;
      }

      setWorkspaceRailCollapsed(w === '1');
      setBubbleSidebarCollapsed(b === '1');
      setChatCollapsedState(chatOn);
      setKanbanCollapsedState(k);
      setCalendarCollapsedState(cal);
    } catch {
      /* ignore */
    }
    setLayoutHydrated(true);
  }, [workspaceId, embedMode, urlTab, urlView]);

  useEffect(() => {
    didDesktopMessagesBubbleForceRef.current = false;
  }, [workspaceId]);

  useEffect(() => {
    if (!layoutHydrated) return;
    if (embedMode) return;
    if (typeof window === 'undefined') return;
    const isDesktop = window.innerWidth >= 768;
    if (!isDesktop) return;
    const messagesFocus = !chatCollapsed && kanbanCollapsed;
    if (!messagesFocus) return;
    if (didDesktopMessagesBubbleForceRef.current) return;
    didDesktopMessagesBubbleForceRef.current = true;
    if (!bubbleSidebarCollapsed) return;
    setBubbleSidebarCollapsed(false);
    try {
      localStorage.setItem(bubbleSidebarCollapsedStorageKey(workspaceId), '0');
    } catch {
      /* ignore */
    }
  }, [
    layoutHydrated,
    embedMode,
    workspaceId,
    chatCollapsed,
    kanbanCollapsed,
    bubbleSidebarCollapsed,
  ]);

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

  /**
   * Mobile explicit `?tab=` / `?view=messages` only (narrow viewport).
   * `?tab=chat` / `?view=messages` on all viewports is handled in the layout hydrate effect.
   */
  useEffect(() => {
    if (!layoutHydrated || embedMode) return;
    const mq = window.matchMedia(NARROW_MAX_QUERY);
    if (!mq.matches) return;
    const viewMessages = urlView?.toLowerCase() === 'messages';
    if (mobileTab === 'chat' || viewMessages) {
      setChatCollapsedState(false);
      setKanbanCollapsedState(true);
      setCalendarCollapsedState(false);
    } else if (mobileTab === 'board') {
      setChatCollapsedState(true);
      setKanbanCollapsedState(false);
    } else if (mobileTab === 'calendar') {
      setChatCollapsedState(true);
      setKanbanCollapsedState(true);
      setCalendarCollapsedState(false);
    }
  }, [layoutHydrated, embedMode, mobileTab, urlView]);

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
          event: 'INSERT',
          schema: 'public',
          table: 'bubbles',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.new as BubbleRow | null;
          if (!row?.id) return;
          // Dedupe against optimistic appends from the originating tab.
          setBubbles((prev) => (prev.some((b) => b.id === row.id) ? prev : [...prev, row]));
        },
      )
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
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'bubbles',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.old as { id?: string } | null;
          if (!row?.id) return;
          setBubbles((prev) => prev.filter((b) => b.id !== row.id));
          // If the deleted bubble was active, fall back to the aggregate view.
          setSelectedBubbleId((prev) => (prev === row.id ? ALL_BUBBLES_BUBBLE_ID : prev));
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

  /** Single member context for chat inserts (`messages.thread_subject_user_id`) and rails. */
  const workspaceSessionSubjectUserId = useMemo(
    () => fitnessProfileTargetUserId ?? profile?.id ?? null,
    [fitnessProfileTargetUserId, profile?.id],
  );

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
      mobileShell.setDrawerOpen(false);
      if (embedMode) return;
      const mq = window.matchMedia(NARROW_MAX_QUERY);
      if (mq.matches) {
        mobileShell.setTab('chat');
      }
    },
    [embedMode, mobileShell],
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
    workspaceCategory: workspaceCategoryForUi,
  };

  const drawerStripProps = {
    workspaceId,
    pendingJoinRequestCount: isAdmin ? pendingJoinRequestCount : 0,
    profileAvatarUrl: profile?.avatar_url ?? null,
    profileName: profile?.full_name ?? profile?.email ?? null,
    onOpenProfile: embedMode ? undefined : () => setProfileModalOpen(true),
    onOpenPeopleInvites: embedMode ? undefined : openPeopleInvites,
    onOpenCreateWorkspace: embedMode ? undefined : openCreateWorkspace,
    onOpenFitnessProfile:
      !embedMode && workspaceCategoryForUi === 'fitness'
        ? () => setFitnessProfileOpen(true)
        : undefined,
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
      if (workoutBoardSelecting) return;
      try {
        localStorage.setItem(dockWorkspaceSplitStorageKey(workspaceId), JSON.stringify(layout));
      } catch {
        /* ignore */
      }
    },
    [workspaceId, workoutBoardSelecting],
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
      showClassDeckBuilder ? (
        <StandaloneClassDeckBuilder
          classInstanceId={classDeckBuilderParam}
          workspaceId={workspaceId}
          bubbles={bubbles}
          selectedBubbleId={selectedBubbleId}
          setSelectedBubbleId={setSelectedBubbleId}
          canWriteTasks={canWriteTasks}
          onWorkoutDeckPersisted={bumpTaskViews}
          onClose={clearClassDeckBuilder}
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
        />
      ) : showClassAsyncPlayer ? (
        <AsyncPlaybackShell
          classInstanceId={classAsyncPlayerParam}
          onClose={clearClassAsyncPlayer}
        />
      ) : isAnalyticsBubble ? (
        <PremiumGate feature="analytics" className="flex-1 min-h-0">
          <AnalyticsBoard workspaceId={workspaceId} calendarTimezone={workspaceCalendarTz} />
        </PremiumGate>
      ) : isClassesBubble ? (
        <ClassesBoard
          workspaceId={workspaceId}
          taskViewsNonce={taskViewsNonce}
          canManageClasses={canManageWorkspaceClasses}
          classCreateBubbleId={defaultTaskModalBubbleId}
          onOpenCreateTask={openCreateTaskModal}
          onOpenClassEditor={(instanceId) =>
            openCreateTaskModal({
              itemType: 'class',
              bubbleId: defaultTaskModalBubbleId,
              classEditorInstanceId: instanceId,
            })
          }
        />
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
          workoutSelectionMode={workoutBoardSelecting}
          onTaskSelectedForWorkoutDeck={(task) =>
            dispatchWorkoutDeckTaskFromBoard(task, workoutDeckSelection.addTaskToDeck)
          }
        />
      ),
    [
      showClassDeckBuilder,
      classDeckBuilderParam,
      clearClassDeckBuilder,
      showClassAsyncPlayer,
      classAsyncPlayerParam,
      clearClassAsyncPlayer,
      bumpTaskViews,
      isAnalyticsBubble,
      isClassesBubble,
      isProgramsBubble,
      workspaceId,
      workspaceCalendarTz,
      selectedBubbleId,
      setSelectedBubbleId,
      bubbles,
      effectiveKanbanCategory,
      taskViewsNonce,
      canWriteTasks,
      canManageWorkspaceClasses,
      defaultTaskModalBubbleId,
      openTaskModal,
      openCreateTaskModal,
      handleStartWorkout,
      boardStripExpandNonce,
      calendarRailIsCollapsed,
      buddyBubbleTitle,
      effectiveWorkspaceRole,
      profile?.id,
      workoutBoardSelecting,
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

  const workoutsBubbleForLiveDeck = useMemo(
    () => bubbles.find((b) => b.name === 'Workouts') ?? null,
    [bubbles],
  );

  const liveDeckBoardSelectionPanel = useMemo(() => {
    if (!workoutsBubbleForLiveDeck) return null;
    return (
      <KanbanBoard
        key="live-selection-kanban"
        canWrite={canWriteTasks}
        bubbles={bubbles}
        bubbleOverride={workoutsBubbleForLiveDeck}
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
        workoutSelectionMode={workoutBoardSelecting}
        onTaskSelectedForWorkoutDeck={(task) =>
          dispatchWorkoutDeckTaskFromBoard(task, workoutDeckSelection.addTaskToDeck)
        }
      />
    );
  }, [
    workoutsBubbleForLiveDeck,
    canWriteTasks,
    bubbles,
    openTaskModal,
    openCreateTaskModal,
    handleStartWorkout,
    effectiveKanbanCategory,
    workspaceCalendarTz,
    boardStripExpandNonce,
    calendarRailIsCollapsed,
    buddyBubbleTitle,
    effectiveWorkspaceRole,
    profile?.id,
    workoutBoardSelecting,
    workoutDeckSelection.addTaskToDeck,
    setCalendarCollapsed,
    setKanbanCollapsed,
  ]);

  const liveDeckSelectionMediaBarEl = useMemo(
    () => <LiveDeckBoardSelectionMediaBar key="live-deck-media" />,
    [],
  );

  const liveVideoDockBoardSlots = useMemo(() => {
    if (!activeLiveVideoSession || !workoutBoardSelecting) return {};
    return {
      boardSelectionPanel: liveDeckBoardSelectionPanel,
      selectionFloatingMediaBar: liveDeckSelectionMediaBarEl,
    };
  }, [
    activeLiveVideoSession,
    workoutBoardSelecting,
    liveDeckBoardSelectionPanel,
    liveDeckSelectionMediaBarEl,
  ]);

  const prevWorkoutBoardSelecting = useRef(false);
  useEffect(() => {
    if (
      activeLiveVideoSession &&
      workoutBoardSelecting &&
      !prevWorkoutBoardSelecting.current &&
      !workoutsBubbleForLiveDeck
    ) {
      toast.error('Add a "Workouts" channel to pick workout cards from the board.');
    }
    prevWorkoutBoardSelecting.current = workoutBoardSelecting;
  }, [activeLiveVideoSession, workoutBoardSelecting, workoutsBubbleForLiveDeck]);

  return (
    <LayoutCommandContext.Provider value={layoutCommands}>
      <WorkspaceSessionProvider subjectUserId={workspaceSessionSubjectUserId}>
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
                <div
                  className="flex h-[100dvh] min-h-0 flex-col bg-background md:flex-row md:overflow-hidden"
                  style={
                    {
                      '--mobile-tab-bar-h': 'calc(4rem + env(safe-area-inset-bottom, 0px))',
                    } as CSSProperties
                  }
                >
                  {layoutMobile ? (
                    <MobileHeader
                      title={buddyBubbleTitle}
                      trailing={embedMode ? null : <ActiveUsersStack localUserId={profile?.id} />}
                    />
                  ) : null}
                  {layoutMobile ? (
                    <MobileSidebarSheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                      <MobileWorkspaceStrip {...drawerStripProps} />
                      <BubbleSidebar {...drawerBubbleProps} hideWorkspaceTitle isMobileDrawerMode />
                    </MobileSidebarSheet>
                  ) : null}

                  <div
                    className={cn(
                      'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
                      layoutMobile && 'max-md:pb-[var(--mobile-tab-bar-h)]',
                      'md:pb-0',
                    )}
                  >
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
                            onBeforeSelectChat={onDesktopSwitcherBeforeSelectChat}
                            onChange={applyDesktopFocusMode}
                            disabled={!layoutHydrated}
                          />
                          {workspaceCategoryForUi === 'fitness' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setFitnessProfileOpen(true)}
                              title="Fitness Profile"
                              aria-label="Fitness Profile"
                              disabled={!layoutHydrated}
                              className="h-8 w-8"
                            >
                              <Dumbbell className="h-4 w-4" aria-hidden />
                            </Button>
                          ) : null}
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
                          /* Copilot suggestion ignored: Wrapping LiveTheaterPlanBranch keeps Agora mounted across shellKind transitions; narrowing the provider would reintroduce disconnect-on-layout churn without a portal/slot refactor. */
                          <DashboardLiveVideoDockProvider session={activeLiveVideoSession}>
                            <LiveTheaterPlanBranch>
                              {(plan) => {
                                const shellKind =
                                  workoutBoardSelecting &&
                                  activeLiveVideoSession &&
                                  plan.shell.kind !== 'inactive'
                                    ? 'theater_focus'
                                    : plan.shell.kind !== 'inactive'
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
                                        <DashboardLiveVideoDockBody
                                          session={activeLiveVideoSession}
                                          localUserId={profile.id}
                                          displayName={
                                            profile.full_name ?? profile.email ?? undefined
                                          }
                                          onLeaveSession={onLiveVideoLeaveSession}
                                          onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
                                          canWriteTasks={canWriteTasks}
                                          onWorkoutDeckPersisted={bumpTaskViews}
                                          onClassRecordingPipelineUpdated={bumpTaskViews}
                                          workoutsBubbleId={workoutsBubbleForLiveDeck?.id ?? null}
                                          {...liveVideoDockBoardSlots}
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
                                      <DashboardLiveVideoDockBody
                                        session={activeLiveVideoSession}
                                        localUserId={profile.id}
                                        displayName={
                                          profile.full_name ?? profile.email ?? undefined
                                        }
                                        onLeaveSession={onLiveVideoLeaveSession}
                                        onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
                                        canWriteTasks={canWriteTasks}
                                        onWorkoutDeckPersisted={bumpTaskViews}
                                        onClassRecordingPipelineUpdated={bumpTaskViews}
                                        workoutsBubbleId={workoutsBubbleForLiveDeck?.id ?? null}
                                        {...liveVideoDockBoardSlots}
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
                                        <DashboardLiveVideoDockBody
                                          session={activeLiveVideoSession}
                                          localUserId={profile.id}
                                          displayName={
                                            profile.full_name ?? profile.email ?? undefined
                                          }
                                          onLeaveSession={onLiveVideoLeaveSession}
                                          onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
                                          canWriteTasks={canWriteTasks}
                                          onWorkoutDeckPersisted={bumpTaskViews}
                                          onClassRecordingPipelineUpdated={bumpTaskViews}
                                          workoutsBubbleId={workoutsBubbleForLiveDeck?.id ?? null}
                                          {...liveVideoDockBoardSlots}
                                        />
                                      </ResizablePanel>
                                    </ResizablePanelGroup>
                                  );
                                }

                                return null;
                              }}
                            </LiveTheaterPlanBranch>
                          </DashboardLiveVideoDockProvider>
                        ) : (
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            {workspaceStage}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {layoutMobile ? <MobileTabBar /> : null}

                  <TaskModal
                    open={taskModalOpen}
                    onOpenChange={onTaskModalOpenChange}
                    taskId={taskModalTaskId}
                    bubbleId={resolvedTaskModalBubbleId}
                    workspaceId={workspaceId}
                    bubbles={bubbles}
                    canWrite={canWriteTasks}
                    canManageClasses={canManageWorkspaceClasses}
                    classEditorInstanceId={taskModalClassEditorInstanceId}
                    onClassCreated={() => {
                      bumpTaskViews();
                      onTaskModalOpenChange(false);
                    }}
                    onClassSaved={bumpTaskViews}
                    onCreated={(id) => {
                      setTaskModalTaskId(id);
                      bumpTaskViews();
                      const postToChat = chatCardOnCreatedRef.current;
                      chatCardOnCreatedRef.current = null;
                      if (postToChat) postToChat(id);
                    }}
                    isOptimisticDraft={taskModalOptimisticDraft}
                    draftBaseline={taskModalDraftBaseline}
                    onOptimisticDraftConsumed={() => {
                      setTaskModalOptimisticDraft(false);
                      setTaskModalDraftBaseline(null);
                    }}
                    onOptimisticDraftAutoDeleted={bumpTaskViews}
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
                  {workoutPlayerLaunch ? (
                    <WorkoutPlayer
                      open
                      onClose={() => {
                        setWorkoutPlayerLaunch(null);
                      }}
                      workspaceId={workspaceId}
                      workoutTitle={workoutPlayerLaunch.task.title}
                      metadata={workoutPlayerLaunch.task.metadata}
                      bubbleId={workoutPlayerLaunch.task.bubble_id}
                      sourceTaskId={workoutPlayerLaunch.task.id}
                      sessionId={workoutPlayerLaunch.sessionId}
                      class_instance_id={workoutPlayerLaunch.class_instance_id}
                      isMemberView={workoutPlayerLaunch.isMemberView}
                      canPostMessages={canPostMessages}
                      workoutData={workoutPlayerLaunch.workoutData}
                      onComplete={bumpTaskViews}
                    />
                  ) : null}
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
                      targetUserId={fitnessProfileTargetUserId}
                      bubbleIdForTasks={
                        selectedBubbleId && selectedBubbleId !== ALL_BUBBLES_BUBBLE_ID
                          ? selectedBubbleId
                          : null
                      }
                      onQuickWorkoutCreated={bumpTaskViews}
                    />
                  ) : null}
                  {workspaceCategoryForUi === 'fitness' || workspaceCategoryForUi === 'business' ? (
                    <StartTrialModal
                      workspaceId={workspaceId}
                      categoryType={workspaceCategoryForUi}
                    />
                  ) : null}
                  <LiveClassReminderModal
                    workspaceId={workspaceId}
                    enabled={!embedMode && workspaceCategoryForUi === 'fitness'}
                  />
                  {commentAlert ? (
                    <div
                      className={cn(
                        'pointer-events-auto fixed left-1/2 z-[100] flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg md:bottom-6',
                        layoutMobile
                          ? 'bottom-[calc(var(--mobile-tab-bar-h)+0.5rem)]'
                          : 'bottom-20 max-md:bottom-20',
                      )}
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
                            focusMessagesOnClose: true,
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
                  {workoutBoardSelecting && !activeLiveVideoSession ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className={cn(
                        'fixed left-4 z-[200] shadow-md md:bottom-6 md:left-6',
                        layoutMobile
                          ? 'bottom-[calc(var(--mobile-tab-bar-h)+0.5rem)]'
                          : 'bottom-24 max-md:bottom-24',
                      )}
                      onClick={() => workoutDeckSelection.exitSelectionMode()}
                    >
                      Exit selection mode
                    </Button>
                  ) : null}
                  {children}
                </div>
              </ThemeScope>
            </LiveVideoSessionShell>
          </LiveSessionRuntimeProvider>
        </AnalyticsProvider>
      </WorkspaceSessionProvider>
    </LayoutCommandContext.Provider>
  );
}

export function DashboardShell(props: Props) {
  return (
    <WorkoutDeckSelectionProvider>
      <MobileShellProvider>
        <DashboardShellInner {...props} />
      </MobileShellProvider>
    </WorkoutDeckSelectionProvider>
  );
}
