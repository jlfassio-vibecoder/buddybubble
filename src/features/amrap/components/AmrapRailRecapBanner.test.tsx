import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AmrapRailRecapBanner } from '@/features/amrap/components/AmrapRailRecapBanner';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

const mockAmrapRailOptional = vi.hoisted(() => vi.fn());

vi.mock('@/features/live-video/contexts/AmrapRailContext', () => ({
  useAmrapRailOptional: () => mockAmrapRailOptional(),
}));

afterEach(() => {
  cleanup();
  mockAmrapRailOptional.mockReset();
});

function baseEngine(overrides: Partial<AmrapSessionEngine> = {}): AmrapSessionEngine {
  return {
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
    participants: [],
    selfParticipant: null,
    startTimer: null,
    resetTimer: null,
    advanceSegment: null,
    logRound: null,
    finalizeSession: null,
    participantRoundLaps: [],
    roundLapEntries: [],
    selfMinuteSplitEntries: [],
    loading: false,
    error: null,
    slots: { sessionDrawer: null, hostNavActions: null },
    pageState: {
      showViewResultsModal: false,
      handleOpenViewResults: vi.fn(),
      handleCloseViewResults: vi.fn(),
      viewResultsText: '',
      roundDurations: [],
      minuteSplitEntries: [],
      copyResults: vi.fn(),
      copyResultsToast: null,
      isHost: false,
      savedToAnalytics: false,
    },
    ...overrides,
  };
}

describe('AmrapRailRecapBanner', () => {
  it('renders host Lock & Save and View results when not finalized', () => {
    mockAmrapRailOptional.mockReturnValue({
      engine: baseEngine({ finalizeSession: vi.fn() }),
      isHost: true,
    });

    render(<AmrapRailRecapBanner />);
    expect(screen.getByText('AMRAP complete')).toBeTruthy();
    expect(screen.getByRole('button', { name: /lock & save/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /view results/i })).toBeTruthy();
  });

  it('renders participant waiting copy and provisional results before finalize', () => {
    mockAmrapRailOptional.mockReturnValue({
      engine: baseEngine(),
      isHost: false,
    });

    render(<AmrapRailRecapBanner />);
    expect(screen.getByText('Waiting for host to lock results')).toBeTruthy();
    expect(screen.getByRole('button', { name: /view provisional results/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /lock & save/i })).toBeNull();
  });

  it('renders participant locked copy after finalize', () => {
    mockAmrapRailOptional.mockReturnValue({
      engine: baseEngine({ resultsFinalizedAt: '2026-06-01T12:00:00Z' }),
      isHost: false,
    });

    render(<AmrapRailRecapBanner />);
    expect(screen.getByText('Results locked')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^view results$/i })).toBeTruthy();
  });

  it('returns null when timer is not finished', () => {
    mockAmrapRailOptional.mockReturnValue({
      engine: baseEngine({ timerPhase: 'work' }),
      isHost: true,
    });

    const { container } = render(<AmrapRailRecapBanner />);
    expect(container.firstChild).toBeNull();
  });
});
