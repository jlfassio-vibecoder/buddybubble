import { describe, expect, it } from 'vitest';
import { formatSetLogLine } from './format-set-log-line';

describe('formatSetLogLine', () => {
  it('formats weight, reps, and RPE in metric', () => {
    expect(formatSetLogLine({ set: 1, weight: 100, reps: 8, rpe: 8, done: true }, 'metric')).toBe(
      'Set 1 · 100 kg · 8 reps · RPE 8',
    );
  });

  it('uses lbs for imperial', () => {
    expect(formatSetLogLine({ set: 2, weight: 225, reps: 5, done: true }, 'imperial')).toBe(
      'Set 2 · 225 lbs · 5 reps',
    );
  });

  it('omits missing fields', () => {
    expect(formatSetLogLine({ set: 3, reps: 12, done: true })).toBe('Set 3 · 12 reps');
  });

  it('renders set number only when no performance fields', () => {
    expect(formatSetLogLine({ set: 1, done: true })).toBe('Set 1');
  });
});
