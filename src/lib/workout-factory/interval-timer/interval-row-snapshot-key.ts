import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';

export function intervalRowSnapshotKey(snapshot: IntervalRowSnapshot | null): string {
  if (snapshot == null) return 'null';
  const stations =
    snapshot.activeStationIndices != null
      ? [...snapshot.activeStationIndices].sort((a, b) => a - b).join(',')
      : '';
  return `${snapshot.roundIndex}:${snapshot.activeSetPhase}:${stations}`;
}
