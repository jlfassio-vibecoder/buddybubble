import { describe, expect, it } from 'vitest';
import { BLOCK_FORMAT_ENUM } from '@/lib/agents/coach/block-blueprint-library';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
  SUBTITLE_SNIPPETS,
} from './__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from './workout-session-view-model';

describe('buildWorkoutSessionViewModel', () => {
  describe('12 parametric formats', () => {
    it.each(BLOCK_FORMAT_ENUM)('rich %s block has expected subtitle', (blockFormat) => {
      const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat(blockFormat));
      expect(vm.source).toBe('rich');
      const main = vm.blocks.find((b) => b.section === 'main');
      expect(main).toBeDefined();
      const expected = SUBTITLE_SNIPPETS[blockFormat];
      if (expected == null) {
        expect(main!.subtitle).toBeNull();
      } else {
        expect(main!.subtitle).toContain(expected);
      }
      expect(main!.blockFormat).toBe(blockFormat);
    });
  });

  it('orders sections warmup → main → finisher → cooldown', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const sections = vm.blocks.map((b) => b.section);
    expect(sections).toEqual(['warmup', 'main', 'finisher', 'cooldown']);
  });

  it('flat-only metadata', () => {
    const vm = buildWorkoutSessionViewModel({
      exercises: [{ name: 'Deadlift', sets: 5, reps: 5 }],
    });
    expect(vm.source).toBe('flat');
    expect(vm.workoutSet).toBeNull();
    expect(vm.blocks).toHaveLength(1);
    expect(vm.blocks[0].section).toBe('main');
    expect(vm.flatExercises).toHaveLength(1);
  });

  it('empty metadata', () => {
    const vm = buildWorkoutSessionViewModel({});
    expect(vm.source).toBe('empty');
    expect(vm.blocks).toHaveLength(0);
  });

  it('factory with empty workouts falls back to flat', () => {
    const vm = buildWorkoutSessionViewModel({
      ai_workout_factory: { workout_set: { workouts: [] } },
      exercises: [{ name: 'Bench', sets: 3, reps: 8 }],
    });
    expect(vm.source).toBe('flat');
    expect(vm.flatExercises[0].name).toBe('Bench');
  });

  it('unknown blockFormat keeps exercises with null blockFormat', () => {
    const meta = richMetadataWithBlockFormat('amrap');
    const blocks = (
      meta.ai_workout_factory as { workout_set: { workouts: Record<string, unknown>[] } }
    ).workout_set.workouts[0].exerciseBlocks as Record<string, unknown>[];
    blocks[0].blockFormat = 'foo_bar';
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main');
    expect(main!.blockFormat).toBeNull();
    expect(main!.exercises.length).toBeGreaterThan(0);
  });

  it('flatCacheStale when stored flat differs from factory derive', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    (meta as { exercises: unknown[] }).exercises = [{ name: 'Stale Row', sets: 1, reps: 1 }];
    const vm = buildWorkoutSessionViewModel(meta);
    expect(vm.source).toBe('rich');
    expect(vm.flatCacheStale).toBe(true);
  });

  it('flatExercises count matches main block exercises for rich tabata', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const mainCount = vm.blocks
      .filter((b) => b.section === 'main')
      .reduce((n, b) => n + b.exercises.length, 0);
    expect(vm.flatExercises.length).toBe(mainCount);
  });

  it('alternating EMOM main block subtitle includes taxonomy', () => {
    const vm = buildWorkoutSessionViewModel(
      richAlternatingEmomMetadata({ totalRounds: 12, cycle: [[0], [1, 2]] }),
    );
    const main = vm.blocks.find((b) => b.section === 'main');
    expect(main?.subtitle).toContain('Alternating EMOM');
    expect(main?.subtitle).toContain('A / B+C');
  });
});
