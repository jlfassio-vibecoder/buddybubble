import { describe, expect, it } from 'vitest';
import {
  buildWorkoutStructureRationale,
  formatGenerationIntakeAdaptations,
  resolveWorkoutViewerNarrative,
  stripMacroPlanningContextSuffix,
} from '@/lib/workout-factory/workout-viewer-narrative';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

const circuitBlock: WorkoutSessionBlockView = {
  id: 'main-1',
  section: 'main',
  order: 1,
  name: 'Main — Circuit',
  blockFormat: 'circuit',
  formatParams: { rounds: 4 },
  subtitle: 'Circuit · 4 Rounds',
  exercises: [
    { order: 1, exerciseName: 'Lateral Flagging Lunges', sets: 1, reps: '12 per side' },
    { order: 2, exerciseName: 'Pike Push-ups', sets: 1, reps: '10-12' },
  ],
  instructions: [],
};

describe('stripMacroPlanningContextSuffix', () => {
  it('removes appended macro JSON block', () => {
    const brief = 'Climbing circuit for flagging.';
    const withMacro = `${brief}\n\nMacro planning context: {"phase_intent":"standard_progression"}`;
    expect(stripMacroPlanningContextSuffix(withMacro)).toBe(brief);
  });
});

describe('formatGenerationIntakeAdaptations', () => {
  it('formats intake as readable prose', () => {
    const text = formatGenerationIntakeAdaptations({
      duration_minutes: 'Optimized for Goals',
      phase_intent: 'standard_progression',
      progression_trend: 'Appropriately Challenging',
      anchor_lift: { name: 'Deadlift', weight: 305, reps: 3 },
    });
    expect(text).toContain('Goal-driven duration');
    expect(text).toContain('Standard Progression');
    expect(text).toContain('Deadlift 305×3');
  });
});

describe('buildWorkoutStructureRationale', () => {
  it('lists block structure with exercise names', () => {
    const text = buildWorkoutStructureRationale([circuitBlock]);
    expect(text).toContain('Main work');
    expect(text).toContain('Circuit · 4 Rounds');
    expect(text).toContain('Lateral Flagging Lunges');
  });
});

describe('resolveWorkoutViewerNarrative', () => {
  it('splits coach brief from legacy macro suffix and derives structure', () => {
    const brief = 'Bodyweight climbing circuit.';
    const narrative = resolveWorkoutViewerNarrative({
      taskDescription: `${brief}\n\nMacro planning context: {"progression_trend":"Appropriately Challenging"}`,
      metadata: {},
      blocks: [circuitBlock],
    });
    expect(narrative.coachBrief).toBe(brief);
    expect(narrative.structureRationale).toContain('Circuit');
    expect(narrative.sessionAdaptations).toContain('Appropriately Challenging');
  });
});
