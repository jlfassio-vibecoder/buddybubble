/** Formats remaining whole seconds as `MM:SS` (floor, clamped at 0). */
export function formatCountdownMmSs(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
