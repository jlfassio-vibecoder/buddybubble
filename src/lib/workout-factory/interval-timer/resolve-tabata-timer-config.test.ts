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
      totalRounds: 8,
    });
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
  });
});
