import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';

/**
 * Screen-reader label matching the legacy comma-joined leaderboard line (names + rounds + avg).
 */
export function buildAmrapLeaderboardRowAriaLabel(
  participants: AmrapParticipantEngine[],
  allSameRounds: boolean,
  avgLapSec: number | null,
  showAvg: boolean,
  formatAvgSec: (sec: number) => string,
): string {
  const namesJoined = participants.map((p) => `${p.name}${p.isSelf ? ' (you)' : ''}`).join(', ');
  const roundsVals = participants.map((p) => p.rounds);
  const mixedRoundsLine = participants
    .map((p) => `${p.name}${p.isSelf ? ' (you)' : ''} (${p.rounds}r)`)
    .join(', ');
  const n = roundsVals[0] ?? 0;
  const roundsPart = allSameRounds
    ? `${namesJoined} — ${n} round${n === 1 ? '' : 's'}`
    : mixedRoundsLine;
  const avgPart =
    showAvg && avgLapSec != null
      ? allSameRounds
        ? ` (avg ${formatAvgSec(avgLapSec)})`
        : ` — avg ${formatAvgSec(avgLapSec)}`
      : '';
  return `${roundsPart}${avgPart}`;
}
