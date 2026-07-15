import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';

describe('resolveTabataTimerConfig', () => {
  it('returns work/rest/rounds from tabata block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const block = vm.blocks.find((b) => b.section === 'main' && b.blockFormat === 'tabata');
    expect(block).toBeDefined();
    const cfg = resolveTabataTimerConfig(block!);
    expect(cfg).toEqual({
      prepareMs: 0,
      workMs: 20_000,
      restMs: 10_000,
      roundRestMs: 0,
      totalRounds: 8,
      circuitRounds: 8,
      exerciseCount: 1,
    });
  });

  it('multiplies totalRounds by exercise count when N > 1', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('circuit'));
    const block = vm.blocks.find((b) => b.blockFormat === 'circuit')!;
    const cfg = resolveTabataTimerConfig({
      ...block,
      blockFormat: 'tabata',
      formatParams: {
        rounds: 3,
        work_seconds: 30,
        rest_seconds: 30,
        interval_preset: 'classic_hiit',
      },
    });
    expect(cfg).toEqual({
      prepareMs: 0,
      workMs: 30_000,
      restMs: 30_000,
      roundRestMs: 0,
      totalRounds: 9,
      circuitRounds: 3,
      exerciseCount: 3,
    });
  });

  it('maps round_rest_seconds to roundRestMs and keeps 0', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('circuit'));
    const block = vm.blocks.find((b) => b.blockFormat === 'circuit')!;
    const withRr = resolveTabataTimerConfig({
      ...block,
      blockFormat: 'tabata',
      formatParams: {
        rounds: 3,
        work_seconds: 40,
        rest_seconds: 15,
        round_rest_seconds: 60,
      },
    });
    expect(withRr?.roundRestMs).toBe(60_000);

    const zeroRr = resolveTabataTimerConfig({
      ...block,
      blockFormat: 'tabata',
      formatParams: {
        rounds: 3,
        work_seconds: 40,
        rest_seconds: 15,
        round_rest_seconds: 0,
      },
    });
    expect(zeroRr?.roundRestMs).toBe(0);
  });

  it('does not multiply when exercise array is empty', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const block = vm.blocks.find((b) => b.blockFormat === 'tabata')!;
    const cfg = resolveTabataTimerConfig({
      ...block,
      exercises: [],
      formatParams: { rounds: 3, work_seconds: 30, rest_seconds: 30 },
    });
    expect(cfg?.totalRounds).toBe(3);
    expect(cfg?.circuitRounds).toBe(3);
    expect(cfg?.exerciseCount).toBe(0);
  });

  it('returns null when rounds missing', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const block = vm.blocks.find((b) => b.blockFormat === 'tabata')!;
    const cfg = resolveTabataTimerConfig({
      ...block,
      formatParams: { work_seconds: 20, rest_seconds: 10 },
    });
    expect(cfg).toBeNull();
  });

  it('returns null for non-tabata block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const block = vm.blocks.find((b) => b.section === 'main')!;
    expect(resolveTabataTimerConfig(block)).toBeNull();
  });

  it('defaults work and rest when omitted', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const block = vm.blocks.find((b) => b.blockFormat === 'tabata')!;
    const cfg = resolveTabataTimerConfig({
      ...block,
      formatParams: { rounds: 4 },
    });
    expect(cfg?.workMs).toBe(20_000);
    expect(cfg?.restMs).toBe(10_000);
    expect(cfg?.totalRounds).toBe(4);
    expect(cfg?.circuitRounds).toBe(4);
  });

  it('preserves rest_seconds 0 (Path A) instead of defaulting to 10s', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('circuit'));
    const block = vm.blocks.find((b) => b.blockFormat === 'circuit')!;
    const cfg = resolveTabataTimerConfig({
      ...block,
      blockFormat: 'tabata',
      formatParams: {
        rounds: 3,
        work_seconds: 40,
        rest_seconds: 0,
        round_rest_seconds: 60,
      },
    });
    expect(cfg?.restMs).toBe(0);
    expect(cfg?.roundRestMs).toBe(60_000);
  });
});
