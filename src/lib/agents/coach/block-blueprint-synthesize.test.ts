import { describe, expect, it } from 'vitest';
import {
  formatServerBlockShellsPromptBlock,
  mergeBlueprintShellsWithModelBlocks,
  summarizeWorkoutContextForRailBlockAppend,
  synthesizeProposedBlocksFromMentions,
  WORKOUT_BLOCK_INDEX_HEADER,
} from './block-blueprint-synthesize';

describe('summarizeWorkoutContextForRailBlockAppend', () => {
  it('returns compact block index instead of full JSON', () => {
    const exercises = Array.from({ length: 40 }, (_, i) => ({
      name: `Exercise ${i + 1}`,
      sets: 3,
      reps: 10,
      notes: 'Long coaching note that would bloat the raw JSON payload if repeated.',
    }));
    const full = JSON.stringify({
      ai_workout_factory: {
        workout_set: {
          workouts: [
            {
              name: 'Main',
              exerciseBlocks: [{ name: 'Main', exercises }],
              warmupBlocks: [{ exerciseName: 'Warm-up', instructions: ['Row 500m', 'Band work'] }],
            },
          ],
        },
      },
    });
    const summary = summarizeWorkoutContextForRailBlockAppend(full);
    expect(summary).toContain('Exercise 1');
    expect(summary!.length).toBeLessThan(full.length / 4);
    expect(summary).not.toContain('Long coaching note');
  });
});

describe('synthesizeProposedBlocksFromMentions', () => {
  it('builds fixed tabata shell from client mention', () => {
    const shells = synthesizeProposedBlocksFromMentions([
      {
        token: ':finisher/tabata ',
        section_name: 'Finisher',
        section_role: 'finisher',
        block_format: 'tabata',
        format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
      },
    ]);
    expect(shells[0].block_format).toBe('tabata');
    expect(shells[0].format_params.rounds).toBe(8);
    expect(shells[0].exercises).toEqual([]);
  });
});

describe('mergeBlueprintShellsWithModelBlocks', () => {
  it('keeps shell format_params when model fills exercises', () => {
    const shells = synthesizeProposedBlocksFromMentions([
      {
        token: ':finisher/tabata ',
        section_name: 'Finisher',
        section_role: 'finisher',
        block_format: 'tabata',
        format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
      },
    ]);
    const merged = mergeBlueprintShellsWithModelBlocks(shells, [
      {
        name: 'Finisher',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 99 },
        exercises: [{ name: 'Burpees', sets: 1, reps: 8 }],
      },
    ]);
    expect(merged[0].block_format).toBe('tabata');
    expect(merged[0].format_params).toEqual({ rounds: 8, work_seconds: 20, rest_seconds: 10 });
    expect(merged[0].exercises).toEqual([{ name: 'Burpees', sets: 1, reps: 8 }]);
  });

  it('hydrates alternating EMOM format_params when model fills exercises', () => {
    const shells = synthesizeProposedBlocksFromMentions([
      {
        token: ':main/emom/alternating ',
        section_name: 'Main',
        section_role: 'main',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 10, is_alternating: true },
      },
    ]);
    const merged = mergeBlueprintShellsWithModelBlocks(shells, [
      {
        name: 'Main',
        exercises: [
          { name: 'Band Bent-Over Rows', sets: 1, reps: '10' },
          { name: 'Band Woodchoppers', sets: 1, reps: '10' },
        ],
      },
    ]);
    expect(merged[0].format_params).toEqual({
      interval_seconds: 60,
      total_minutes: 10,
      is_alternating: true,
      alternating_stations: [[0], [1]],
    });
  });
});

describe('formatServerBlockShellsPromptBlock', () => {
  it('includes fixed-structure instruction', () => {
    const block = formatServerBlockShellsPromptBlock(
      synthesizeProposedBlocksFromMentions([
        {
          token: ':finisher/tabata ',
          section_name: 'Finisher',
          section_role: 'finisher',
          block_format: 'tabata',
          format_params: { rounds: 8 },
        },
      ]),
    );
    expect(block).toContain('FIXED by the client composer token');
    expect(block).not.toContain(WORKOUT_BLOCK_INDEX_HEADER);
  });
});
