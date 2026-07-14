import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { useWorkoutBuilderChatRail } from '@/features/workout-builder/useWorkoutBuilderChatRail';
import type { WorkoutOutlineEditorState } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';

function outlineEditor(overrides: Partial<WorkoutOutlineEditorState>): WorkoutOutlineEditorState {
  return {
    draftBlocks: [],
    outlineUiState: 'confirmed',
    validationDrops: [],
    isOutlineConfirmed: true,
    canRunIntake: true,
    expandedBlockIdx: null,
    setExpandedBlockIdx: () => {},
    localError: null,
    isGenerating: false,
    addFromCatalog: async () => true,
    addInstructionBlock: async () => true,
    updateBlock: () => {},
    removeBlock: () => {},
    reorderBlocks: () => {},
    saveDraft: async () => true,
    confirmStructure: async () => true,
    editStructure: () => {},
    retryStructure: async () => true,
    applyCoachPatch: () => true,
    hasFactory: true,
    title: 'Test',
    description: '',
    setDraftBlocks: () => {},
    ...overrides,
  } as WorkoutOutlineEditorState;
}

describe('useWorkoutBuilderChatRail', () => {
  it('attaches slim workoutContext after factory even when outline draft is not attached', () => {
    const metadata = richMetadataWithBlockFormat('straight_sets') as Json;
    const { result } = renderHook(() =>
      useWorkoutBuilderChatRail({
        outlineEditor: outlineEditor({ hasFactory: true, isOutlineConfirmed: true }),
        metadata,
        title: 'Cue day',
      }),
    );

    const meta = result.current.buildOutgoingMessageMetadata({ content: '@coach hi', files: [] });
    expect(meta).not.toBeNull();
    expect(meta?.workoutContext).toBeTruthy();
    expect(meta?.task_modal_outline_draft).toBeUndefined();
  });

  it('attaches outline draft before factory confirmation', () => {
    const { result } = renderHook(() =>
      useWorkoutBuilderChatRail({
        outlineEditor: outlineEditor({
          hasFactory: false,
          isOutlineConfirmed: false,
          draftBlocks: [
            {
              name: 'Main',
              block_format: 'straight_sets',
              exercises: [{ name: 'Squat' }],
            },
          ],
        }),
        metadata: {},
        title: 'Outline day',
      }),
    );

    const meta = result.current.buildOutgoingMessageMetadata({ content: '@coach hi', files: [] });
    expect(meta?.task_modal_outline_draft).toBeTruthy();
  });
});
