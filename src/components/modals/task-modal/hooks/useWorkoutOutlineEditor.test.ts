import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Json } from '@/types/database';
import { BLOCK_BLUEPRINT_CATALOG } from '@/lib/agents/coach/block-blueprint-catalog';
import { useWorkoutOutlineEditor } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import { postGenerateWorkoutOutline } from '@/lib/ai/generate-workout-outline-client';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@/lib/ai/generate-workout-outline-client', () => ({
  postGenerateWorkoutOutline: vi.fn(),
}));

const mockPostGenerateWorkoutOutline = vi.mocked(postGenerateWorkoutOutline);

const emomBlock = {
  name: 'Warm-up',
  block_format: 'emom',
  format_params: { interval_seconds: 60, total_minutes: 5, total_rounds: 5 },
  exercises: [{ name: 'Movement' }],
};

const circuitBlock = {
  name: 'Main Circuit',
  block_format: 'circuit',
  format_params: { rounds: 3 },
  exercises: [{ name: 'Station 1' }, { name: 'Station 2' }, { name: 'Station 3' }],
};

function buildHookArgs(overrides: {
  metadata: Json;
  setMetadata?: ReturnType<typeof vi.fn>;
  patchOriginalMetadataJson?: ReturnType<typeof vi.fn>;
  saveCoreFields?: ReturnType<typeof vi.fn>;
  taskId?: string;
  enabled?: boolean;
}) {
  return {
    canWrite: true,
    taskId: overrides.taskId ?? 'task-1',
    workspaceId: 'ws-1',
    title: 'Workout',
    description: 'Test',
    metadata: overrides.metadata,
    setMetadata: overrides.setMetadata ?? vi.fn(),
    patchOriginalMetadataJson: overrides.patchOriginalMetadataJson ?? vi.fn(),
    saveCoreFields: overrides.saveCoreFields,
    enabled: overrides.enabled,
  };
}

describe('useWorkoutOutlineEditor', () => {
  beforeEach(() => {
    mockPostGenerateWorkoutOutline.mockReset();
  });

  it('does not auto-call postGenerateWorkoutOutline on mount with empty outline', () => {
    renderHook(() =>
      useWorkoutOutlineEditor(
        buildHookArgs({
          metadata: {} as Json,
        }),
      ),
    );

    expect(mockPostGenerateWorkoutOutline).not.toHaveBeenCalled();
  });

  it('calls postGenerateWorkoutOutline when retryStructure is invoked explicitly', async () => {
    mockPostGenerateWorkoutOutline.mockResolvedValue({
      metadata: {
        coach_workout_outline: [emomBlock],
        coach_outline_status: 'ready',
      } as unknown as Json,
    });

    const { result } = renderHook(() =>
      useWorkoutOutlineEditor(
        buildHookArgs({
          metadata: {} as Json,
        }),
      ),
    );

    await act(async () => {
      await result.current.retryStructure();
    });

    expect(mockPostGenerateWorkoutOutline).toHaveBeenCalledTimes(1);
    expect(mockPostGenerateWorkoutOutline).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      task_id: 'task-1',
    });
  });

  it('retryStructure no-ops when enabled is false', async () => {
    const { result } = renderHook(() =>
      useWorkoutOutlineEditor(
        buildHookArgs({
          metadata: {} as Json,
          enabled: false,
        }),
      ),
    );

    await act(async () => {
      await result.current.retryStructure();
    });

    expect(mockPostGenerateWorkoutOutline).not.toHaveBeenCalled();
  });

  it('retryStructure no-ops when ai_workout_factory exists', async () => {
    const metadata = {
      ai_workout_factory: {
        workout_set: { workouts: [{ name: 'Session', exercises: [] }] },
      },
    } as unknown as Json;

    const { result } = renderHook(() =>
      useWorkoutOutlineEditor(
        buildHookArgs({
          metadata,
        }),
      ),
    );

    await act(async () => {
      await result.current.retryStructure();
    });

    expect(mockPostGenerateWorkoutOutline).not.toHaveBeenCalled();
  });

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

  it('addFromCatalog persists the appended block (no stale saveDraft race)', async () => {
    const saveCoreFields = vi.fn().mockResolvedValue(true);
    const setMetadata = vi.fn();
    const patchOriginalMetadataJson = vi.fn();
    const preset = BLOCK_BLUEPRINT_CATALOG[0]!;

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
      const ok = await result.current.addFromCatalog(preset);
      expect(ok).toBe(true);
    });

    expect(saveCoreFields).toHaveBeenCalledTimes(1);
    const saved = saveCoreFields.mock.calls[0]?.[0] as Record<string, unknown>;
    const outline = saved.coach_workout_outline as Record<string, unknown>[];
    expect(outline.length).toBe(2);
    expect(result.current.draftBlocks.length).toBe(2);
  });

  it('keeps local unsaved deletions when stale metadata refreshes', () => {
    const initialMetadata = {
      coach_workout_outline: [emomBlock, circuitBlock],
      coach_outline_status: 'ready',
    } as unknown as Json;

    const { result, rerender } = renderHook(
      (props: { metadata: Json }) =>
        useWorkoutOutlineEditor(
          buildHookArgs({
            metadata: props.metadata,
          }),
        ),
      { initialProps: { metadata: initialMetadata } },
    );

    expect(result.current.draftBlocks.length).toBe(2);

    act(() => {
      result.current.removeBlock(1);
    });
    expect(result.current.draftBlocks.length).toBe(1);

    const staleRefreshMetadata = {
      ...(initialMetadata as Record<string, unknown>),
      unrelated_chat_field: 'still stale outline in db',
    } as unknown as Json;

    rerender({ metadata: staleRefreshMetadata });
    expect(result.current.draftBlocks.length).toBe(1);
  });

  it('reloads outline from metadata when taskId changes', () => {
    const taskOneMetadata = {
      coach_workout_outline: [emomBlock],
      coach_outline_status: 'ready',
    } as unknown as Json;
    const taskTwoMetadata = {
      coach_workout_outline: [circuitBlock],
      coach_outline_status: 'ready',
    } as unknown as Json;

    const { result, rerender } = renderHook(
      (props: { metadata: Json; taskId: string }) =>
        useWorkoutOutlineEditor(
          buildHookArgs({
            metadata: props.metadata,
            taskId: props.taskId,
          }),
        ),
      { initialProps: { metadata: taskOneMetadata, taskId: 'task-1' } },
    );

    expect(result.current.draftBlocks.length).toBe(1);
    expect(result.current.draftBlocks[0]?.name).toBe('Warm-up');

    rerender({ metadata: taskTwoMetadata, taskId: 'task-2' });
    expect(result.current.draftBlocks.length).toBe(1);
    expect(result.current.draftBlocks[0]?.name).toBe('Main Circuit');
  });

  it('applyCoachPatch updates draftBlocks while dirty protection is active', () => {
    const initialMetadata = {
      coach_workout_outline: [emomBlock, circuitBlock],
      coach_outline_status: 'ready',
    } as unknown as Json;

    const { result } = renderHook(() =>
      useWorkoutOutlineEditor(buildHookArgs({ metadata: initialMetadata })),
    );

    act(() => {
      result.current.removeBlock(1);
    });
    expect(result.current.draftBlocks.length).toBe(1);

    const coachBlocks = [
      {
        name: 'Coach AMRAP',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 15 },
        exercises: [{ name: 'A' }, { name: 'B' }],
      },
    ];

    act(() => {
      const applied = result.current.applyCoachPatch({
        revision: 5,
        localRevision: 4,
        blocks: coachBlocks,
      });
      expect(applied).toBe(true);
    });

    expect(result.current.draftBlocks.length).toBe(1);
    expect(result.current.draftBlocks[0]?.name).toBe('Coach AMRAP');
  });
});
