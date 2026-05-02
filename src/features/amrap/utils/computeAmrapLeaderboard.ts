import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';

export type AmrapLeaderboardGroup = {
  rank: number;
  avgLapSec: number | null;
  participants: AmrapParticipantEngine[];
};

/**
 * Dense-rank leaderboard: fastest average lap first. Ties share a row (bucketed by
 * avgLapSec rounded to the nearest second). Null avg (no usable lap data) sorts last;
 * within a bucket, names are ascending.
 */
export function computeAmrapLeaderboard(
  participants: AmrapParticipantEngine[],
): AmrapLeaderboardGroup[] {
  if (participants.length === 0) return [];

  const buckets = new Map<number | 'null', AmrapParticipantEngine[]>();

  for (const p of participants) {
    const key =
      p.avgLapSec == null || !Number.isFinite(p.avgLapSec)
        ? ('null' as const)
        : Math.round(p.avgLapSec);
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }

  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const numericKeys = [...buckets.keys()]
    .filter((k): k is number => k !== 'null')
    .sort((a, b) => a - b);
  const orderedKeys: (number | 'null')[] = [...numericKeys];
  if (buckets.has('null')) orderedKeys.push('null');

  return orderedKeys.map((key, i) => {
    const parts = buckets.get(key)!;
    const avgLapSec = key === 'null' ? null : key;
    return {
      rank: i + 1,
      avgLapSec,
      participants: parts,
    };
  });
}
