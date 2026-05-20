import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  formatBlockSummaryLine,
  formatFlatExerciseLine,
  formatRichWorkoutStripSummary,
} from './format-block-summary-line';

describe('formatBlockSummaryLine', () => {
  it('includes subtitle and exercise count for main tabata block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const line = formatBlockSummaryLine(main);
    expect(line).toContain('MAIN');
    expect(main.subtitle).toBeTruthy();
    expect(line).toContain(main.subtitle!);
    expect(line).toContain('exercise');
  });

  it('uses instruction count for warmup-only blocks', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const warmup = vm.blocks.find((b) => b.section === 'warmup')!;
    const line = formatBlockSummaryLine(warmup);
    expect(line).toContain('instruction');
  });
});

describe('formatFlatExerciseLine', () => {
  it('formats sets and name', () => {
    expect(formatFlatExerciseLine({ name: 'Push-ups', sets: 3, reps: 10 })).toContain('Push-ups');
  });
});

describe('formatRichWorkoutStripSummary', () => {
  it('joins block summaries for rich tabata metadata', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const text = formatRichWorkoutStripSummary(vm.blocks, { maxBlocks: 3 });
    expect(text).toBeTruthy();
    const main = vm.blocks.find((b) => b.section === 'main')!;
    if (main.subtitle) {
      expect(text).toContain(main.subtitle);
    }
  });
});
