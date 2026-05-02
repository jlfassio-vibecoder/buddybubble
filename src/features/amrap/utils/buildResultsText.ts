import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';
import {
  computeAmrapLeaderboard,
  type AmrapLeaderboardGroup,
} from '@/features/amrap/utils/computeAmrapLeaderboard';

function formatAvgSec(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatGroupLine(group: AmrapLeaderboardGroup): string {
  const { rank, participants, avgLapSec } = group;
  const namesJoined = participants.map((p) => `${p.name}${p.isSelf ? ' (you)' : ''}`).join(', ');
  const roundsVals = participants.map((p) => p.rounds);
  const allSameRounds = roundsVals.every((r) => r === roundsVals[0]);
  const hasAvg = avgLapSec != null && roundsVals.some((r) => r > 0);

  if (participants.length === 1) {
    const p = participants[0];
    const roundsWord = `${p.rounds} round${p.rounds === 1 ? '' : 's'}`;
    return `${rank}. ${namesJoined} — ${roundsWord}${hasAvg ? ` (avg ${formatAvgSec(avgLapSec!)})` : ''}`;
  }

  if (allSameRounds) {
    const n = roundsVals[0];
    const roundsWord = `${n} round${n === 1 ? '' : 's'}`;
    return `${rank}. ${namesJoined} — ${roundsWord}${hasAvg ? ` (avg ${formatAvgSec(avgLapSec!)})` : ''}`;
  }

  const namesWithR = participants
    .map((p) => `${p.name}${p.isSelf ? ' (you)' : ''} (${p.rounds}r)`)
    .join(', ');
  return `${rank}. ${namesWithR}${hasAvg ? ` — avg ${formatAvgSec(avgLapSec!)}` : ''}`;
}

/**
 * Plain-text leaderboard from frozen dense-rank groups (post-finalize).
 */
export function buildResultsTextFromGroups(groups: AmrapLeaderboardGroup[]): string {
  if (groups.length === 0) {
    return 'Leaderboard\n(no participants yet)';
  }
  const lines = groups.map((g) => formatGroupLine(g));
  return ['Leaderboard', ...lines].join('\n');
}

/**
 * Plain-text leaderboard for clipboard + View Results modal.
 */
export function buildResultsText(participants: AmrapParticipantEngine[]): string {
  if (participants.length === 0) {
    return 'Leaderboard\n(no participants yet)';
  }
  const groups = computeAmrapLeaderboard(participants);
  return buildResultsTextFromGroups(groups);
}
