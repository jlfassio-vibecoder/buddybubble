import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Json } from '@/types/database';
import { useWorkoutSessionViewModel } from './use-workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';

describe('useWorkoutSessionViewModel', () => {
  it('returns rich view model from metadata', () => {
    const meta = richMetadataWithBlockFormat('emom') as Json;
    const { result } = renderHook(() => useWorkoutSessionViewModel(meta));
    expect(result.current.source).toBe('rich');
    expect(result.current.workoutSet).not.toBeNull();
  });

  it('memoizes when metadata reference is stable', () => {
    const meta = richMetadataWithBlockFormat('amrap') as Json;
    const { result, rerender } = renderHook(({ m }) => useWorkoutSessionViewModel(m), {
      initialProps: { m: meta },
    });
    const first = result.current;
    rerender({ m: meta });
    expect(result.current).toBe(first);
  });
});
