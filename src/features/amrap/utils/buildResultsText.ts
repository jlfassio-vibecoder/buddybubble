import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';

/**
 * Plain-text leaderboard for clipboard + View Results modal.
 */
export function buildResultsText(participants: AmrapParticipantEngine[]): string {
  if (participants.length === 0) {
    return 'Leaderboard\n(no participants yet)';
  }
  const sorted = [...participants].sort((a, b) => {
    if (b.rounds !== a.rounds) return b.rounds - a.rounds;
    return a.name.localeCompare(b.name);
  });
  const lines = sorted.map(
    (p, i) => `${i + 1}. ${p.name} — ${p.rounds} round${p.rounds === 1 ? '' : 's'}`,
  );
  return ['Leaderboard', ...lines].join('\n');
}
