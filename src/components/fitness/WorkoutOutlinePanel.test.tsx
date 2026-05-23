import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkoutOutlinePanel } from '@/components/fitness/WorkoutOutlinePanel';
import type { WorkoutOutlineEditorState } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';

function editorStub(partial: Partial<WorkoutOutlineEditorState>): WorkoutOutlineEditorState {
  return {
    draftBlocks: [],
    setDraftBlocks: () => {},
    outlineUiState: 'empty',
    validationDrops: [],
    isOutlineConfirmed: false,
    canRunIntake: false,
    expandedBlockIdx: null,
    setExpandedBlockIdx: () => {},
    localError: null,
    isGenerating: false,
    addFromCatalog: () => {},
    addInstructionBlock: () => {},
    updateBlock: () => {},
    removeBlock: () => {},
    reorderBlocks: () => {},
    saveDraft: async () => true,
    confirmStructure: async () => true,
    editStructure: async () => {},
    retryStructure: async () => {},
    hasFactory: false,
    title: 'Test',
    description: 'Desc',
    ...partial,
  };
}

describe('WorkoutOutlinePanel', () => {
  it('renders empty state with catalog CTA', () => {
    render(<WorkoutOutlinePanel editor={editorStub({})} canWrite />);
    expect(screen.getByTestId('workout-outline-panel')).toBeTruthy();
    expect(screen.getByText(/Add from catalog/i)).toBeTruthy();
  });

  it('shows confirmed summary when structure confirmed', () => {
    render(
      <WorkoutOutlinePanel
        editor={editorStub({
          outlineUiState: 'confirmed',
          isOutlineConfirmed: true,
          draftBlocks: [{ name: 'Main EMOM', block_format: 'emom', exercises: [{ name: 'A' }] }],
        })}
        canWrite
      />,
    );
    expect(screen.getByText(/Confirmed/i)).toBeTruthy();
    expect(screen.getByText(/Edit structure/i)).toBeTruthy();
  });
});
