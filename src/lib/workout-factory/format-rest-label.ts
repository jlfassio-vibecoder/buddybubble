/** Human-readable rest duration for prescription meta lines. */
export function formatRestLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds >= 60 && seconds % 60 === 0) return `Rest ${seconds / 60} min`;
  if (seconds >= 60) return `Rest ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `Rest ${seconds}s`;
}
