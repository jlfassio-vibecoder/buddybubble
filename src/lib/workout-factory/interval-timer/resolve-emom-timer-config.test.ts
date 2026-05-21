import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { resolveEmomTimerConfig } from './resolve-emom-timer-config';

describe('resolveEmomTimerConfig', () => {
  it('resolves rich EMOM fixture', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('emom'));
    const main = vm.blocks.find((b) => b.blockFormat === 'emom')!;
    const config = resolveEmomTimerConfig(main);
    expect(config).toEqual({
      intervalMs: 60_000,
      totalRounds: 16,
      intervalSeconds: 60,
    });
  });

  it('returns null for wrong format', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.blockFormat === 'tabata')!;
    expect(resolveEmomTimerConfig(main)).toBeNull();
  });

  it('returns null when interval_seconds missing', () => {
    expect(
      resolveEmomTimerConfig({
        id: 'b1',
        section: 'main',
        blockFormat: 'emom',
        formatParams: { total_minutes: 10 },
        exercises: [],
        instructions: [],
        subtitle: null,
        name: 'MAIN',
        order: 1,
      }),
    ).toBeNull();
  });
});
