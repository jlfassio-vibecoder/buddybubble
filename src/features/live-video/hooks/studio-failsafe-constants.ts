/**
 * Solo Studio billing failsafe timers.
 * Duration presets live in `@/lib/live-video/solo-studio-duration` (store-safe).
 */

export {
  SOLO_STUDIO_DURATION_PRESETS_MIN as DURATION_PRESETS_MIN,
  SOLO_STUDIO_MAX_DURATION_MIN as MAX_ESTIMATED_DURATION_MIN,
  isSoloStudioDurationPreset,
  type SoloStudioDurationPresetMin,
} from '@/lib/live-video/solo-studio-duration';

export const OVERTIME_BUFFER_MIN = 5;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const WARNING_COUNTDOWN_MS = 30 * 1000;

/** Ceiling while waiting for an in-flight upload before force-leave. */
export const FORCE_EXIT_UPLOAD_WAIT_MS = 2 * 60 * 1000;

export function overtimeTimeoutMs(estimatedDurationMin: number): number {
  return (estimatedDurationMin + OVERTIME_BUFFER_MIN) * 60 * 1000;
}
