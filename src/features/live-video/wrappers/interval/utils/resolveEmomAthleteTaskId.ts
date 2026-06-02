import type { LiveSessionDeckRow } from '@/features/live-video/hooks/useLiveSessionDeck';

export type ResolveEmomAthleteTaskIdArgs = {
  isHost: boolean;
  /** Live session broadcast deck item id (snapshot id). */
  activeDeckItemId: string | null;
  /** Host fallback: `activeSnapshot.task.id` when session row is not resolved yet. */
  hostSnapshotTaskId: string | null;
  deckRows: LiveSessionDeckRow[];
};

/**
 * EMOM workout log scope: prefer the live session active deck card (same for host
 * and participants), then host editor snapshot task as fallback.
 */
export function resolveEmomAthleteTaskId(args: ResolveEmomAthleteTaskIdArgs): string {
  const deckItemId = args.activeDeckItemId?.trim();
  if (deckItemId) {
    const row = args.deckRows.find((r) => r.id === deckItemId);
    const fromSession = row?.tasks?.id?.trim();
    if (fromSession) return fromSession;
  }
  if (args.isHost) {
    return args.hostSnapshotTaskId?.trim() ?? '';
  }
  return '';
}
