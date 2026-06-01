import { describe, expect, it } from 'vitest';
import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { buildGamifiedRailModel } from '@/features/live-video/hooks/useGamifiedRailModel';
import type { RailParticipant } from '@/features/live-video/ui/gamified-rail.types';

const HOST_ID = '11111111-1111-4111-8111-111111111111';
const P1_ID = '22222222-2222-4222-8222-222222222222';
const P2_ID = '33333333-3333-4333-8333-333333333333';

function mockRemote(uid: number): IAgoraRTCRemoteUser {
  return {
    uid,
    videoTrack: { trackMediaType: 'video' },
  } as unknown as IAgoraRTCRemoteUser;
}

function mockEngine(participants: AmrapSessionEngine['participants']): AmrapSessionEngine {
  return {
    timerPhase: 'work',
    remainingSec: 300,
    totalSec: 600,
    workStartedAt: '2026-01-01T00:00:00.000Z',
    blockSnapshot: null,
    resultsFinalizedAt: null,
    leaderboardSnapshotRaw: null,
    participants,
    selfParticipant: participants.find((p) => p.isSelf) ?? null,
    startTimer: null,
    resetTimer: null,
    logRound: null,
    finalizeSession: null,
    participantRoundLaps: [
      {
        participantId: 'p1',
        displayName: 'Alice',
        isSelf: false,
        entries: [{ round: 1, durationLabel: '0:45' }],
      },
    ],
    roundLapEntries: [],
    loading: false,
    error: null,
    slots: { sessionDrawer: null, hostNavActions: null },
    pageState: {
      showViewResultsModal: false,
      handleOpenViewResults: () => {},
      handleCloseViewResults: () => {},
      viewResultsText: '',
      roundDurations: [],
      copyResults: async () => {},
      copyResultsToast: null,
      isHost: false,
      savedToAnalytics: false,
    },
  };
}

function mockParticipant(
  overrides: Omit<AmrapSessionEngine['participants'][number], 'workoutLogTaskId'> &
    Partial<Pick<AmrapSessionEngine['participants'][number], 'workoutLogTaskId'>>,
): AmrapSessionEngine['participants'][number] {
  return { workoutLogTaskId: null, ...overrides };
}

describe('buildGamifiedRailModel', () => {
  const p1Uid = agoraUidFromUuid(P1_ID);
  const p2Uid = agoraUidFromUuid(P2_ID);

  const railParticipants: RailParticipant[] = [
    { kind: 'local', key: 'local-pip' },
    { kind: 'remote', key: p1Uid, user: mockRemote(p1Uid) },
    { kind: 'remote', key: p2Uid, user: mockRemote(p2Uid) },
  ];

  it('falls back to classic Agora-only rail when phase is not amrap', () => {
    const model = buildGamifiedRailModel({
      phase: 'lobby',
      engine: mockEngine([]),
      railParticipants,
      localHasVideo: true,
      localIsCameraOff: false,
      remoteHasVideo: () => true,
    });
    expect(model.isGamified).toBe(false);
    expect(model.onVideoTiles).toHaveLength(3);
    expect(model.offlineEntries).toHaveLength(0);
  });

  it('sorts on-video tiles by rank and lists offline participants', () => {
    const engine = mockEngine([
      mockParticipant({
        id: 'p1',
        name: 'Alice',
        rounds: 3,
        avgLapSec: 40,
        isHost: false,
        isSelf: false,
        userId: P1_ID,
      }),
      mockParticipant({
        id: 'p2',
        name: 'Bob',
        rounds: 2,
        avgLapSec: 55,
        isHost: false,
        isSelf: true,
        userId: P2_ID,
      }),
      mockParticipant({
        id: 'p3',
        name: 'Carol',
        rounds: 1,
        avgLapSec: 70,
        isHost: false,
        isSelf: false,
        userId: null,
      }),
    ]);

    const model = buildGamifiedRailModel({
      phase: 'amrap',
      engine,
      railParticipants,
      localHasVideo: true,
      localIsCameraOff: false,
      remoteHasVideo: (u) => Boolean(u.videoTrack),
    });

    expect(model.isGamified).toBe(true);
    expect(model.onVideoTiles.map((t) => t.entry.rank)).toEqual([1, 2]);
    expect(model.onVideoTiles[0]?.entry.displayName).toBe('Alice');
    expect(model.offlineEntries).toHaveLength(1);
    expect(model.offlineEntries[0]?.displayName).toBe('Carol');
    expect(model.offlineEntries[0]?.rank).toBe(3);
  });

  it('maps self participant to local rail tile', () => {
    const engine = mockEngine([
      mockParticipant({
        id: 'self',
        name: 'Me',
        rounds: 4,
        avgLapSec: 30,
        isHost: false,
        isSelf: true,
        userId: P2_ID,
      }),
    ]);

    const model = buildGamifiedRailModel({
      phase: 'amrap',
      engine,
      railParticipants,
      localHasVideo: false,
      localIsCameraOff: true,
      remoteHasVideo: () => true,
    });

    const selfTile = model.onVideoTiles.find((t) => t.rail.kind === 'local');
    expect(selfTile?.entry.displayName).toBe('Me');
    expect(selfTile?.entry.hasVideo).toBe(false);
    expect(selfTile?.entry.isSelf).toBe(true);
  });
});
