/** Solo Studio estimated-duration presets (lobby + store validation). */

export const SOLO_STUDIO_DURATION_PRESETS_MIN = [15, 30, 45] as const;
export type SoloStudioDurationPresetMin = (typeof SOLO_STUDIO_DURATION_PRESETS_MIN)[number];

export const SOLO_STUDIO_MAX_DURATION_MIN = 45;

export function isSoloStudioDurationPreset(min: number): min is SoloStudioDurationPresetMin {
  return (SOLO_STUDIO_DURATION_PRESETS_MIN as readonly number[]).includes(min);
}
