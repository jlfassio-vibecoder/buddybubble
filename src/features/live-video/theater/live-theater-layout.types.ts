import type { SessionState } from '@/features/live-video/state/sessionStateMachine';

/** Session-local UX phase for theater / huddle (not persisted). */
export type LiveTheaterPhase = 'deck_building' | 'live_video';

/** Main workspace chrome when a live-video session affects the shell (not persisted as phase). */
export type ShellChromeKind =
  | 'inactive'
  /** Selecting cards from Kanban into deck: dock over full workspace (vertical). */
  | 'vertical_planning'
  /** Mobile/embed: dock over workspace vertical stack (existing behavior). */
  | 'vertical_compact_session'
  /** Desktop live emphasis: video dock only in the main workspace (no chat rail here). */
  | 'theater_focus'
  /** Desktop deck builder: Kanban | video dock split in the main workspace (no chat rail here). */
  | 'theater_board_split';

export type LiveTheaterLayoutInputs = {
  hasLiveVideoSession: boolean;
  isSelectingFromBoard: boolean;
  layoutMobile: boolean;
  embedMode: boolean;
  layoutHydrated: boolean;
  /** From session runtime; omit only before provider mounts — treated as `'builder'`. */
  sessionUiKind?: 'builder' | 'live';
};

export type LiveTheaterShellPlan = {
  kind: ShellChromeKind;
  /** True when Kanban is the primary horizontal stage beside the dock (`theater_board_split`). */
  showHorizontalBoardStage: boolean;
  /** Stop driving theater layout via persisted kanbanCollapsed / hideMainStage hacks. */
  mutePersistedKanbanCollapseForSession: boolean;
};

export type LiveTheaterHuddlePlan = {
  phase: LiveTheaterPhase;
  maximizeVideoInDock: boolean;
  minimizeVideoInDock: boolean;
  /** Prefer flex layouts over legacy CSS grid row tricks. */
  useFlexColumnLayout: boolean;
  /** Legacy root scroll clamp during deck selection — replace with flex when false. */
  useLegacySelectionScrollClamp: boolean;
};

export type LiveTheaterLayoutPlan = {
  active: boolean;
  phase: LiveTheaterPhase;
  shell: LiveTheaterShellPlan;
  huddle: LiveTheaterHuddlePlan;
};

/** Matches LiveSessionView `uiMode` derivation. */
export function sessionUiKindFromSessionState(state: SessionState): 'builder' | 'live' {
  return state.globalStartedAt != null || state.status !== 'idle' ? 'live' : 'builder';
}

export function deriveLiveTheaterLayoutPlan(
  inputs: LiveTheaterLayoutInputs,
): LiveTheaterLayoutPlan {
  const {
    hasLiveVideoSession,
    isSelectingFromBoard,
    layoutMobile,
    embedMode,
    layoutHydrated,
    sessionUiKind: sessionUiKindIn,
  } = inputs;

  const sessionUiKind = sessionUiKindIn ?? 'builder';
  const compact = layoutMobile || embedMode;

  const inactiveShell: LiveTheaterShellPlan = {
    kind: 'inactive',
    showHorizontalBoardStage: false,
    mutePersistedKanbanCollapseForSession: false,
  };

  const inactiveHuddle: LiveTheaterHuddlePlan = {
    phase: 'live_video',
    maximizeVideoInDock: false,
    minimizeVideoInDock: false,
    useFlexColumnLayout: false,
    useLegacySelectionScrollClamp: false,
  };

  if (!layoutHydrated || !hasLiveVideoSession) {
    return {
      active: false,
      phase: 'live_video',
      shell: inactiveShell,
      huddle: inactiveHuddle,
    };
  }

  const mutePersistedKanbanCollapseForSession = true;

  // Mobile / embed: keep vertical dock + workspace stack; phase follows session runtime (not shell split).
  if (compact) {
    const phase: LiveTheaterPhase = isSelectingFromBoard
      ? 'deck_building'
      : sessionUiKind === 'live'
        ? 'live_video'
        : 'deck_building';
    return {
      active: true,
      phase,
      shell: {
        kind: 'vertical_compact_session',
        showHorizontalBoardStage: false,
        mutePersistedKanbanCollapseForSession,
      },
      huddle: {
        phase,
        maximizeVideoInDock: phase === 'live_video',
        minimizeVideoInDock: phase === 'deck_building',
        useFlexColumnLayout: true,
        useLegacySelectionScrollClamp: false,
      },
    };
  }

  // Desktop: horizontal Kanban | dock only while explicitly selecting from the board.
  if (isSelectingFromBoard) {
    return {
      active: true,
      phase: 'deck_building',
      shell: {
        kind: 'theater_board_split',
        showHorizontalBoardStage: true,
        mutePersistedKanbanCollapseForSession,
      },
      huddle: {
        phase: 'deck_building',
        maximizeVideoInDock: false,
        minimizeVideoInDock: true,
        useFlexColumnLayout: true,
        useLegacySelectionScrollClamp: false,
      },
    };
  }

  // Desktop, not selecting: always theater_focus; sessionUiKind only affects huddle phase, not shell split.
  const phase: LiveTheaterPhase = sessionUiKind === 'live' ? 'live_video' : 'deck_building';

  return {
    active: true,
    phase,
    shell: {
      kind: 'theater_focus',
      showHorizontalBoardStage: false,
      mutePersistedKanbanCollapseForSession,
    },
    huddle: {
      phase,
      maximizeVideoInDock: phase === 'live_video',
      minimizeVideoInDock: phase === 'deck_building',
      useFlexColumnLayout: true,
      useLegacySelectionScrollClamp: false,
    },
  };
}
