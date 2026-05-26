import type { AmrapTimerSnapshot } from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import type { EmomTimerSnapshot } from '@/lib/workout-factory/interval-timer/emom-timer-engine';
import type { IntervalEngineState } from '@/lib/workout-factory/interval-timer/interval-engine-state';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { IntervalTimerSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { IntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';

export type { IntervalEngineState } from '@/lib/workout-factory/interval-timer/interval-engine-state';
export type {
  IntervalBlockFormat,
  IntervalBlockConfig,
  IntervalBlockInput,
} from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';

export type IntervalDisplaySnapshot =
  | { format: 'tabata'; snapshot: IntervalTimerSnapshot }
  | { format: 'emom'; snapshot: EmomTimerSnapshot }
  | { format: 'amrap'; snapshot: AmrapTimerSnapshot; roundCount: number };

export type IntervalBlockContext = IntervalBlockInput & {
  engine: IntervalEngineState;
  amrapRoundCount: number;
  rowSnapshot: IntervalRowSnapshot | null;
  displaySnapshot: IntervalDisplaySnapshot;
  lastNowMs: number;
  lastNotifiedRowSnapshotKey: string | null;
};

export type IntervalBlockEvent =
  | { type: 'START'; now?: number }
  | { type: 'PAUSE'; now?: number }
  | { type: 'RESUME'; now?: number }
  | { type: 'RESET' }
  | { type: 'TICK'; now: number }
  | { type: 'CLOCK_FRAME'; now: number }
  | { type: 'LOG_AMRAP_ROUND' }
  | { type: 'VISIBILITY'; hidden: boolean };
