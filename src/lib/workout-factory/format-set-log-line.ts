import type { SetLogEntry } from '@/lib/item-metadata';
import type { UnitSystem } from '@/types/database';

function weightUnitLabel(unitSystem: UnitSystem | undefined): string {
  return unitSystem === 'imperial' ? 'lbs' : 'kg';
}

/** Compact read-only line for one logged set (workout_log `set_logs`). */
export function formatSetLogLine(entry: SetLogEntry, unitSystem: UnitSystem = 'metric'): string {
  const bits: string[] = [`Set ${entry.set}`];
  if (entry.weight != null && !Number.isNaN(entry.weight)) {
    bits.push(`${entry.weight} ${weightUnitLabel(unitSystem)}`);
  }
  if (entry.reps != null && !Number.isNaN(entry.reps)) {
    bits.push(`${entry.reps} reps`);
  }
  if (entry.rpe != null && !Number.isNaN(entry.rpe)) {
    bits.push(`RPE ${entry.rpe}`);
  }
  return bits.join(' · ');
}
