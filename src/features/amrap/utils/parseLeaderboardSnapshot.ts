import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';
import type { AmrapLeaderboardGroup } from '@/features/amrap/utils/computeAmrapLeaderboard';
import type { Json } from '@/types/database';

/** Persisted snapshot rows omit `isSelf` (viewer-specific); each client sets it from `viewerAuthUserId`. */
function isSnapshotParticipant(o: unknown): o is Omit<AmrapParticipantEngine, 'isSelf'> & {
  isSelf?: boolean;
} {
  if (o == null || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  const isSelfOk = r.isSelf === undefined || r.isSelf === null || typeof r.isSelf === 'boolean';
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.rounds === 'number' &&
    Number.isFinite(r.rounds) &&
    typeof r.isHost === 'boolean' &&
    isSelfOk &&
    (r.userId === null || typeof r.userId === 'string') &&
    (r.avgLapSec === null || (typeof r.avgLapSec === 'number' && Number.isFinite(r.avgLapSec)))
  );
}

function isGroup(o: unknown): o is AmrapLeaderboardGroup {
  if (o == null || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  if (typeof r.rank !== 'number' || !Number.isFinite(r.rank) || !Array.isArray(r.participants)) {
    return false;
  }
  if (r.avgLapSec !== null && (typeof r.avgLapSec !== 'number' || !Number.isFinite(r.avgLapSec))) {
    return false;
  }
  return r.participants.every(isSnapshotParticipant);
}

function hydrateIsSelf(
  groups: AmrapLeaderboardGroup[],
  viewerAuthUserId: string | null,
): AmrapLeaderboardGroup[] {
  return groups.map((g) => ({
    ...g,
    participants: g.participants.map((p) => ({
      ...p,
      isSelf: Boolean(viewerAuthUserId && p.userId === viewerAuthUserId),
    })),
  }));
}

/**
 * Strips viewer-specific `isSelf` before RPC persist (host's "you" must not freeze onto other clients).
 */
export function serializeLeaderboardGroupsForFinalize(groups: AmrapLeaderboardGroup[]): Json {
  return groups.map((g) => ({
    rank: g.rank,
    avgLapSec: g.avgLapSec,
    participants: g.participants.map(({ isSelf: _ignored, ...rest }) => rest),
  })) as Json;
}

/**
 * Validates JSON from `amrap_sessions.leaderboard_snapshot`. Returns null if shape is wrong (UI falls back to live math).
 * `viewerAuthUserId` is used to set `isSelf` on each row (snapshots omit that flag at rest).
 */
export function parseLeaderboardSnapshot(
  raw: unknown,
  viewerAuthUserId: string | null,
): AmrapLeaderboardGroup[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  if (!raw.every(isGroup)) return null;
  return hydrateIsSelf(raw as AmrapLeaderboardGroup[], viewerAuthUserId);
}
