import {
  amrapTimerReducer,
  createInitialAmrapTimerState,
  deriveAmrapTimerSnapshot,
} from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import {
  createInitialEmomTimerState,
  deriveEmomTimerSnapshot,
  emomTimerReducer,
} from '@/lib/workout-factory/interval-timer/emom-timer-engine';
import {
  createInitialIntervalTimerState,
  deriveIntervalTimerSnapshot,
  getPhaseRemainingMs,
  intervalTimerReducer,
} from '@/lib/workout-factory/interval-timer/interval-timer-engine';
import {
  intervalTimerSnapshotToRowSnapshot,
  amrapTimerSnapshotToRowSnapshot,
  type IntervalRowSnapshot,
} from '@/lib/workout-factory/interval-timer/types';
import { getEmomRemainingMs } from '@/lib/workout-factory/interval-timer/emom-timer-engine';
import { getAmrapRemainingMs } from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import type {
  IntervalBlockContext,
  IntervalBlockEvent,
  IntervalDisplaySnapshot,
} from './interval-block.types';
import type { IntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';
import type { IntervalEngineState } from '@/lib/workout-factory/interval-timer/interval-engine-state';

function createInitialEngine(input: IntervalBlockInput): IntervalEngineState {
  switch (input.format) {
    case 'tabata':
      return { format: 'tabata', state: createInitialIntervalTimerState(input.config) };
    case 'emom':
      return { format: 'emom', state: createInitialEmomTimerState(input.config) };
    case 'amrap':
      return { format: 'amrap', state: createInitialAmrapTimerState(input.config) };
  }
}

function emomSnapshotToRowSnapshot(
  snapshot: ReturnType<typeof deriveEmomTimerSnapshot>,
): IntervalRowSnapshot | null {
  if (snapshot.phase === 'idle' || snapshot.phase === 'done') return null;
  const activeSetPhase = snapshot.phase === 'paused' ? 'paused' : 'work';
  return {
    roundIndex: snapshot.roundIndex,
    activeSetPhase,
    ...(snapshot.activeStationIndices != null
      ? { activeStationIndices: snapshot.activeStationIndices }
      : {}),
  };
}

export function deriveRowSnapshot(
  engine: IntervalEngineState,
  now: number,
  opts?: { amrapRoundCount?: number },
): IntervalRowSnapshot | null {
  switch (engine.format) {
    case 'tabata':
      return intervalTimerSnapshotToRowSnapshot(deriveIntervalTimerSnapshot(engine.state, now));
    case 'emom':
      return emomSnapshotToRowSnapshot(deriveEmomTimerSnapshot(engine.state, now));
    case 'amrap': {
      const row = amrapTimerSnapshotToRowSnapshot(deriveAmrapTimerSnapshot(engine.state, now));
      if (!row) return null;
      return {
        ...row,
        roundIndex: Math.max(0, opts?.amrapRoundCount ?? 0),
      };
    }
  }
}

export function deriveDisplaySnapshot(
  ctx: Pick<IntervalBlockContext, 'engine' | 'amrapRoundCount'>,
  now: number,
): IntervalDisplaySnapshot {
  switch (ctx.engine.format) {
    case 'tabata':
      return {
        format: 'tabata',
        snapshot: deriveIntervalTimerSnapshot(ctx.engine.state, now),
      };
    case 'emom':
      return {
        format: 'emom',
        snapshot: deriveEmomTimerSnapshot(ctx.engine.state, now),
      };
    case 'amrap':
      return {
        format: 'amrap',
        snapshot: deriveAmrapTimerSnapshot(ctx.engine.state, now),
        roundCount: ctx.amrapRoundCount,
      };
  }
}

export function createInitialIntervalBlockContext(input: IntervalBlockInput): IntervalBlockContext {
  const engine = createInitialEngine(input);
  const now = 0;
  const rowSnapshot = deriveRowSnapshot(engine, now);
  return {
    ...input,
    engine,
    amrapRoundCount: 0,
    rowSnapshot,
    displaySnapshot: deriveDisplaySnapshot({ engine, amrapRoundCount: 0 }, now),
    lastNowMs: now,
    lastNotifiedRowSnapshotKey: null,
  };
}

export function isEnginePhaseDone(engine: IntervalEngineState): boolean {
  switch (engine.format) {
    case 'tabata':
      return engine.state.phase === 'done';
    case 'emom':
      return engine.state.phase === 'done';
    case 'amrap':
      return engine.state.phase === 'done';
  }
}

export function isEngineRunnable(engine: IntervalEngineState): boolean {
  switch (engine.format) {
    case 'tabata':
      return (
        engine.state.phase === 'prepare' ||
        engine.state.phase === 'work' ||
        engine.state.phase === 'rest'
      );
    case 'emom':
      return engine.state.phase === 'running';
    case 'amrap':
      return engine.state.phase === 'running';
  }
}

export function engineNeedsReducerTick(engine: IntervalEngineState, now: number): boolean {
  if (!isEngineRunnable(engine)) return false;
  switch (engine.format) {
    case 'tabata':
      return getPhaseRemainingMs(engine.state, now) <= 0;
    case 'emom':
      return getEmomRemainingMs(engine.state, now) <= 0;
    case 'amrap':
      return getAmrapRemainingMs(engine.state, now) <= 0;
  }
}

function applyReducerEvent(
  engine: IntervalEngineState,
  event: IntervalBlockEvent,
  now: number,
): IntervalEngineState {
  switch (event.type) {
    case 'START':
      switch (engine.format) {
        case 'tabata':
          return {
            format: 'tabata',
            state: intervalTimerReducer(engine.state, { type: 'start', now }),
          };
        case 'emom':
          return {
            format: 'emom',
            state: emomTimerReducer(engine.state, { type: 'start', now }),
          };
        case 'amrap':
          return {
            format: 'amrap',
            state: amrapTimerReducer(engine.state, { type: 'start', now }),
          };
      }
      break;
    case 'PAUSE':
      switch (engine.format) {
        case 'tabata':
          return {
            format: 'tabata',
            state: intervalTimerReducer(engine.state, { type: 'pause', now }),
          };
        case 'emom':
          return {
            format: 'emom',
            state: emomTimerReducer(engine.state, { type: 'pause', now }),
          };
        case 'amrap':
          return {
            format: 'amrap',
            state: amrapTimerReducer(engine.state, { type: 'pause', now }),
          };
      }
      break;
    case 'RESUME':
      switch (engine.format) {
        case 'tabata':
          return {
            format: 'tabata',
            state: intervalTimerReducer(engine.state, { type: 'resume', now }),
          };
        case 'emom':
          return {
            format: 'emom',
            state: emomTimerReducer(engine.state, { type: 'resume', now }),
          };
        case 'amrap':
          return {
            format: 'amrap',
            state: amrapTimerReducer(engine.state, { type: 'resume', now }),
          };
      }
      break;
    case 'RESET':
      switch (engine.format) {
        case 'tabata':
          return { format: 'tabata', state: createInitialIntervalTimerState(engine.state.config) };
        case 'emom':
          return { format: 'emom', state: createInitialEmomTimerState(engine.state.config) };
        case 'amrap':
          return { format: 'amrap', state: createInitialAmrapTimerState(engine.state.config) };
      }
    case 'TICK':
      switch (engine.format) {
        case 'tabata':
          return {
            format: 'tabata',
            state: intervalTimerReducer(engine.state, { type: 'tick', now: event.now }),
          };
        case 'emom':
          return {
            format: 'emom',
            state: emomTimerReducer(engine.state, { type: 'tick', now: event.now }),
          };
        case 'amrap':
          return {
            format: 'amrap',
            state: amrapTimerReducer(engine.state, { type: 'tick', now: event.now }),
          };
      }
      break;
    default:
      break;
  }
  return engine;
}

function refreshDerived(ctx: IntervalBlockContext, now: number): IntervalBlockContext {
  const rowSnapshot = deriveRowSnapshot(ctx.engine, now, {
    amrapRoundCount: ctx.amrapRoundCount,
  });
  return {
    ...ctx,
    lastNowMs: now,
    rowSnapshot,
    displaySnapshot: deriveDisplaySnapshot(ctx, now),
  };
}

/** Fast-forward engine after tab backgrounding using absolute wall time. */
export function catchUpIntervalEngine(
  ctx: IntervalBlockContext,
  now: number,
): IntervalBlockContext {
  if (engineNeedsReducerTick(ctx.engine, now)) {
    return applyIntervalEngineEvent(ctx, { type: 'TICK', now });
  }
  return refreshDerived(ctx, now);
}

export function applyIntervalEngineEvent(
  ctx: IntervalBlockContext,
  event: IntervalBlockEvent,
): IntervalBlockContext {
  const now =
    'now' in event && typeof event.now === 'number'
      ? event.now
      : event.type === 'CLOCK_FRAME'
        ? event.now
        : event.type === 'LOG_AMRAP_ROUND'
          ? ctx.lastNowMs
          : Date.now();

  if (event.type === 'LOG_AMRAP_ROUND') {
    if (ctx.format !== 'amrap') return ctx;
    return refreshDerived({ ...ctx, amrapRoundCount: ctx.amrapRoundCount + 1 }, now);
  }

  if (event.type === 'CLOCK_FRAME') {
    if (engineNeedsReducerTick(ctx.engine, now)) {
      const engine = applyReducerEvent(ctx.engine, { type: 'TICK', now }, now);
      return refreshDerived({ ...ctx, engine }, now);
    }
    return refreshDerived(ctx, now);
  }

  if (event.type === 'RESET') {
    const engine = createInitialEngine(ctx);
    return refreshDerived(
      {
        ...ctx,
        engine,
        amrapRoundCount: 0,
      },
      now,
    );
  }

  if (
    event.type === 'START' ||
    event.type === 'PAUSE' ||
    event.type === 'RESUME' ||
    event.type === 'TICK'
  ) {
    const engine = applyReducerEvent(
      ctx.engine,
      event.type === 'TICK' ? event : { ...event, now },
      now,
    );
    return refreshDerived({ ...ctx, engine }, now);
  }

  return ctx;
}
