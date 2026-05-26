import { resolveAmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import { resolveEmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import type { AmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import type { EmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import type { TabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type IntervalBlockFormat = 'tabata' | 'emom' | 'amrap';

export type IntervalBlockConfig =
  | { format: 'tabata'; config: TabataTimerConfig }
  | { format: 'emom'; config: EmomTimerConfig }
  | { format: 'amrap'; config: AmrapTimerConfig };

export type IntervalBlockInput = {
  blockId: string;
} & IntervalBlockConfig;

export function resolveIntervalBlockInput(
  block: WorkoutSessionBlockView,
): IntervalBlockInput | null {
  if (block.blockFormat === 'tabata') {
    const config = resolveTabataTimerConfig(block);
    if (!config) return null;
    return { blockId: block.id, format: 'tabata', config };
  }
  if (block.blockFormat === 'emom') {
    const config = resolveEmomTimerConfig(block);
    if (!config) return null;
    return { blockId: block.id, format: 'emom', config };
  }
  if (block.blockFormat === 'amrap') {
    const config = resolveAmrapTimerConfig(block);
    if (!config) return null;
    return { blockId: block.id, format: 'amrap', config };
  }
  return null;
}
