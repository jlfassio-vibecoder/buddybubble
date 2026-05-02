import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';
import type { AmrapLeaderboardGroup } from '@/features/amrap/utils/computeAmrapLeaderboard';

function isParticipant(o: unknown): o is AmrapParticipantEngine {
  if (o == null || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.rounds === 'number' &&
    Number.isFinite(r.rounds) &&
    typeof r.isHost === 'boolean' &&
    typeof r.isSelf === 'boolean' &&
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
  return r.participants.every(isParticipant);
}

/**
 * Validates JSON from `amrap_sessions.leaderboard_snapshot`. Returns null if shape is wrong (UI falls back to live math).
 */
export function parseLeaderboardSnapshot(raw: unknown): AmrapLeaderboardGroup[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  if (!raw.every(isGroup)) return null;
  return raw as AmrapLeaderboardGroup[];
}
