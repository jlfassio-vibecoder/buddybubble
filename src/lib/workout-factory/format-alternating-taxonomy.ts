/**
 * S&C whiteboard taxonomy for alternating EMOM `alternating_stations` cycles.
 * Example: [[0], [1, 2]] → "A / B+C"
 */

/** Map 0-based exercise index to whiteboard letter (0→A, 1→B, … 25→Z). */
export function emomStationIndexToLetter(index: number): string {
  const i = Math.trunc(index);
  if (!Number.isFinite(i) || i < 0) return '';
  if (i <= 25) return String.fromCharCode(65 + i);
  return `S${i + 1}`;
}

function formatMinuteSlot(slot: readonly number[]): string {
  const letters: string[] = [];
  for (const raw of slot) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const letter = emomStationIndexToLetter(raw);
    if (letter) letters.push(letter);
  }
  return letters.join('+');
}

/**
 * Render alternating_stations cycle as S&C whiteboard vernacular.
 * Minute slots joined with " / "; intra-minute stations joined with "+".
 */
export function formatAlternatingEmomTaxonomy(
  alternatingStations: readonly (readonly number[])[],
): string {
  if (!Array.isArray(alternatingStations) || alternatingStations.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const slot of alternatingStations) {
    if (!Array.isArray(slot) || slot.length === 0) continue;
    const label = formatMinuteSlot(slot);
    if (label) parts.push(label);
  }
  return parts.join(' / ');
}
