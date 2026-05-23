import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Json } from '@/types/database';
import { useWorkoutOutlineEditor } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/ai/generate-workout-outline-client', () => ({
  postGenerateWorkoutOutline: vi.fn(),
}));

const emomBlock = {
  name: 'Warm-up',
  block_format: 'emom',
  format_params: { interval_seconds: 60, total_minutes: 5, total_rounds: 5 },
  exercises: [{ name: 'Movement' }],
};

describe('useWorkoutOutlineEditor', () => {
  it('confirmStructure passes coach_outline_confirmed_at into saveCoreFields', async () => {
    const saveCoreFields = vi.fn().mockResolvedValue(true);
    const setMetadata = vi.fn();
    const patchOriginalMetadataJson = vi.fn();

    const metadata = {
      coach_workout_outline: [emomBlock],
      coach_outline_status: 'ready',
    } as unknown as Json;

    const { result } = renderHook(() =>
      useWorkoutOutlineEditor({
        canWrite: true,
        taskId: 'task-1',
        workspaceId: 'ws-1',
        title: 'Workout',
        description: 'Test',
        metadata,
        setMetadata,
        patchOriginalMetadataJson,
        saveCoreFields,
      }),
    );

    await act(async () => {
      const ok = await result.current.confirmStructure();
      expect(ok).toBe(true);
    });

    expect(saveCoreFields).toHaveBeenCalledTimes(1);
    const saved = saveCoreFields.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof saved.coach_outline_confirmed_at).toBe('string');
    expect(saved.coach_outline_confirmed_at).toBeTruthy();
    expect(Array.isArray(saved.coach_workout_outline)).toBe(true);
  });
});
