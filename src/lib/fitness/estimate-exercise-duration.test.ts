import { describe, expect, it } from 'vitest';
import {
  cumulativeDurationsSec,
  estimateExerciseDurationSec,
  estimateQueueDurationsSec,
  findActiveIndexFromCumulative,
  parseRepsForEstimate,
} from './estimate-exercise-duration';

describe('parseRepsForEstimate', () => {
  it('returns positive numbers as-is', () => {
    expect(parseRepsForEstimate(10)).toBe(10);
  });

  it('averages hyphen and en-dash ranges', () => {
    expect(parseRepsForEstimate('8-10')).toBe(9);
    expect(parseRepsForEstimate('8–10')).toBe(9);
  });

  it('returns null for AMRAP / max / empty / unparsable', () => {
    expect(parseRepsForEstimate('AMRAP')).toBeNull();
    expect(parseRepsForEstimate('max')).toBeNull();
    expect(parseRepsForEstimate('')).toBeNull();
    expect(parseRepsForEstimate('  ')).toBeNull();
    expect(parseRepsForEstimate(null)).toBeNull();
    expect(parseRepsForEstimate(undefined)).toBeNull();
  });
});

describe('estimateExerciseDurationSec', () => {
  it('priority 1: duration_min beats sets/reps', () => {
    expect(
      estimateExerciseDurationSec({
        duration_min: 2,
        sets: 5,
        reps: 10,
        name: 'Back Squat',
      }),
    ).toBe(120);
  });

  it('priority 2: interval work_seconds + rounds beats sets/reps', () => {
    // (40 + 20) * 8 = 480
    expect(
      estimateExerciseDurationSec({
        work_seconds: 40,
        rest_seconds: 20,
        rounds: 8,
        sets: 3,
        reps: 10,
        name: 'Burpee',
      }),
    ).toBe(480);
  });

  it('priority 2: uses default rest 15 when rest_seconds missing', () => {
    // (30 + 15) * 4 = 180
    expect(
      estimateExerciseDurationSec({
        work_seconds: 30,
        rounds: 4,
      }),
    ).toBe(180);
  });

  it('priority 3: sets × reps with "8-10" midpoint and squat family (4s/rep, 90s rest)', () => {
    // 3 * 9 * 4 + 2 * 90 = 108 + 180 = 288
    expect(
      estimateExerciseDurationSec({
        name: 'Back Squat',
        sets: 3,
        reps: '8-10',
      }),
    ).toBe(288);
  });

  it('priority 3: unparsable reps with sets uses AMRAP default 10', () => {
    // 2 * 10 * 3 + 1 * 60 = 60 + 60 = 120 (default family)
    expect(
      estimateExerciseDurationSec({
        name: 'Mystery Move',
        sets: 2,
        reps: 'AMRAP',
      }),
    ).toBe(120);
  });

  it('priority 4: sets only uses 45s bucket', () => {
    expect(estimateExerciseDurationSec({ sets: 4 })).toBe(180);
  });

  it('priority 5: empty input defaults to 90s', () => {
    expect(estimateExerciseDurationSec({})).toBe(90);
  });

  it('keyword: push-up uses 2.5s/rep family', () => {
    // 3 * 10 * 2.5 + 2 * 60 = 75 + 120 = 195
    expect(
      estimateExerciseDurationSec({
        name: 'Push-up',
        sets: 3,
        reps: 10,
      }),
    ).toBe(195);
  });

  it('keyword: unknown name uses 3.0s/rep default', () => {
    // 2 * 8 * 3 + 1 * 60 = 48 + 60 = 108
    expect(
      estimateExerciseDurationSec({
        name: 'Zog Flex',
        sets: 2,
        reps: 8,
      }),
    ).toBe(108);
  });

  it('clamps huge duration_min to 900s', () => {
    expect(estimateExerciseDurationSec({ duration_min: 60 })).toBe(900);
  });

  it('clamps tiny positive duration_min to 20s', () => {
    expect(estimateExerciseDurationSec({ duration_min: 0.1 })).toBe(20);
  });
});

describe('queue helpers', () => {
  it('estimateQueueDurationsSec maps items', () => {
    expect(estimateQueueDurationsSec([{ duration_min: 1 }, { sets: 2 }, {}])).toEqual([60, 90, 90]);
  });

  it('estimateQueueDurationsSec prefers finite estimateSec', () => {
    expect(
      estimateQueueDurationsSec([
        { duration_min: 1, estimateSec: 42 },
        { sets: 2, estimateSec: 0 },
      ]),
    ).toEqual([42, 90]);
  });

  it('cumulativeDurationsSec builds prefix sums', () => {
    expect(cumulativeDurationsSec([10, 20, 30])).toEqual([0, 10, 30, 60]);
  });

  it('findActiveIndexFromCumulative handles edges', () => {
    const cum = cumulativeDurationsSec([10, 20, 30]); // [0, 10, 30, 60]
    expect(findActiveIndexFromCumulative(cum, 0)).toBe(0);
    expect(findActiveIndexFromCumulative(cum, 9)).toBe(0);
    expect(findActiveIndexFromCumulative(cum, 10)).toBe(1);
    expect(findActiveIndexFromCumulative(cum, 29)).toBe(1);
    expect(findActiveIndexFromCumulative(cum, 30)).toBe(2);
    expect(findActiveIndexFromCumulative(cum, 100)).toBe(2);
    expect(findActiveIndexFromCumulative([], 5)).toBe(0);
  });
});
