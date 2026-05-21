import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { resolveAmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';

describe('resolveAmrapTimerConfig', () => {
  it('returns timeCapMs from amrap block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const block = vm.blocks.find((b) => b.blockFormat === 'amrap')!;
    const cfg = resolveAmrapTimerConfig(block);
    expect(cfg).toEqual({
      timeCapMs: 12 * 60_000,
      targetRounds: null,
    });
  });

  it('returns targetRounds when set', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const block = vm.blocks.find((b) => b.blockFormat === 'amrap')!;
    const cfg = resolveAmrapTimerConfig({
      ...block,
      formatParams: { time_cap_minutes: 10, target_rounds: 5 },
    });
    expect(cfg?.targetRounds).toBe(5);
    expect(cfg?.timeCapMs).toBe(10 * 60_000);
  });

  it('returns null when time_cap_minutes missing', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const block = vm.blocks.find((b) => b.blockFormat === 'amrap')!;
    expect(
      resolveAmrapTimerConfig({
        ...block,
        formatParams: {},
      }),
    ).toBeNull();
  });

  it('returns null for non-amrap block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const block = vm.blocks.find((b) => b.blockFormat === 'tabata')!;
    expect(resolveAmrapTimerConfig(block)).toBeNull();
  });
});
