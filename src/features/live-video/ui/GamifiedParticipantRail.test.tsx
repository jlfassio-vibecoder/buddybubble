import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GamifiedParticipantRail } from './GamifiedParticipantRail';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

const mockRuntimeOptional = vi.hoisted(() =>
  vi.fn((): { state: { phase: string } } | null => ({
    state: { phase: 'amrap' },
  })),
);

const mockAmrapRailOptional = vi.hoisted(() =>
  vi.fn(
    (): {
      amrapSessionId: string;
      engine: AmrapSessionEngine;
      isHost: boolean;
      setAmrapRail: ReturnType<typeof vi.fn>;
    } | null => null,
  ),
);

const mockEngine: AmrapSessionEngine = {
  intervalType: 'amrap',
  timerPhase: 'finished',
  remainingSec: 0,
  totalSec: 600,
  workStartedAt: null,
  blockSnapshot: null,
  mechanicsState: null,
  segmentLabel: '',
  currentRoundIndex: 0,
  resultsFinalizedAt: null,
  leaderboardSnapshotRaw: null,
  participants: [
    {
      id: 'self',
      name: 'Me',
      rounds: 2,
      avgLapSec: 45,
      isHost: false,
      isSelf: true,
      userId: 'user-1',
      workoutLogTaskId: null,
    },
  ],
  selfParticipant: {
    id: 'self',
    name: 'Me',
    rounds: 2,
    avgLapSec: 45,
    isHost: false,
    isSelf: true,
    userId: 'user-1',
    workoutLogTaskId: null,
  },
  startTimer: null,
  resetTimer: null,
  advanceSegment: null,
  logRound: null,
  finalizeSession: vi.fn(),
  participantRoundLaps: [
    {
      participantId: 'self',
      displayName: 'Me',
      isSelf: true,
      entries: [{ round: 1, durationLabel: '0:45' }],
    },
  ],
  roundLapEntries: [{ round: 1, durationLabel: '0:45' }],
  loading: false,
  error: null,
  slots: { sessionDrawer: null, hostNavActions: null },
  pageState: {
    showViewResultsModal: false,
    handleOpenViewResults: vi.fn(),
    handleCloseViewResults: vi.fn(),
    viewResultsText: '',
    roundDurations: [],
    copyResults: vi.fn(),
    copyResultsToast: null,
    isHost: true,
    savedToAnalytics: false,
  },
};

function defaultAmrapRail() {
  return {
    amrapSessionId: 'amrap-1',
    engine: mockEngine,
    isHost: true,
    setAmrapRail: vi.fn(),
  };
}

vi.mock('@/features/live-video/agora-session-context', () => ({
  useAgoraSession: () => ({
    localVideoTrack: null,
    isMicMuted: false,
    isCameraOff: true,
    remoteUsers: [{ uid: 42, videoTrack: null }],
  }),
}));

vi.mock('@/features/live-video/hooks/useRailParticipants', () => ({
  useRailParticipants: () => ({
    localRtcUid: 99,
    allRailParticipants: [{ kind: 'local', key: 'local-pip' }],
  }),
  remoteUserHasVideo: () => false,
}));

vi.mock('@/features/live-video/theater/live-session-runtime-context', () => ({
  useLiveSessionRuntimeOptional: () => mockRuntimeOptional(),
}));

vi.mock('@/features/live-video/contexts/AmrapRailContext', () => ({
  useAmrapRailOptional: () => mockAmrapRailOptional(),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockRuntimeOptional.mockReset();
  mockRuntimeOptional.mockReturnValue({ state: { phase: 'amrap' } });
  mockAmrapRailOptional.mockReset();
  mockAmrapRailOptional.mockReturnValue(defaultAmrapRail());
});

describe('GamifiedParticipantRail', () => {
  it('renders rank badge, rounds, lap chips, and host recap banner', () => {
    render(<GamifiedParticipantRail localUserId="local" hostUserId="host" />);
    expect(screen.getByLabelText('Rank 1')).toBeTruthy();
    expect(screen.getByText(/2 rnds/)).toBeTruthy();
    expect(screen.getByText(/R1 0:45/)).toBeTruthy();
    expect(screen.getByRole('region', { name: /amrap results actions/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /lock & save/i })).toBeTruthy();
  });

  it('renders participant recap banner when host is false', () => {
    mockAmrapRailOptional.mockReturnValue({
      ...defaultAmrapRail(),
      isHost: false,
      engine: {
        ...mockEngine,
        finalizeSession: null,
        pageState: { ...mockEngine.pageState, isHost: false },
      },
    });

    render(<GamifiedParticipantRail localUserId="local" hostUserId="host" />);
    expect(screen.getByText('Waiting for host to lock results')).toBeTruthy();
    expect(screen.getByRole('button', { name: /view provisional results/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /lock & save/i })).toBeNull();
  });

  it('renders classic rail without session runtime (scaffold-safe)', () => {
    mockRuntimeOptional.mockReturnValue(null);
    mockAmrapRailOptional.mockReturnValue(null);

    render(<GamifiedParticipantRail localUserId="local" hostUserId="host" />);
    expect(screen.getByLabelText('Participant thumbnails')).toBeTruthy();
    expect(screen.queryByLabelText('Rank 1')).toBeNull();
    expect(screen.queryByRole('region', { name: /amrap results actions/i })).toBeNull();
  });
});
