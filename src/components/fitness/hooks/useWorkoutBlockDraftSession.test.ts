import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  useWorkoutBlockDraftSession,
  type UseWorkoutBlockDraftSessionArgs,
} from './useWorkoutBlockDraftSession';

function sourceFromFormat(format: 'emom' | 'tabata') {
  const metadata = richMetadataWithBlockFormat(format) as Json;
  const vm = buildWorkoutSessionViewModel(metadata);
  return {
    title: 'Test workout',
    description: 'Desc',
    exercises: [] as UseWorkoutBlockDraftSessionArgs['source']['exercises'],
    blocks: vm.blocks,
  };
}

describe('useWorkoutBlockDraftSession', () => {
  it('keeps edit mode and drafts when source soft-changes', () => {
    const sourceA = sourceFromFormat('emom');
    const sourceB = sourceFromFormat('tabata');

    const { result, rerender } = renderHook(
      ({ syncKey, source }: UseWorkoutBlockDraftSessionArgs) =>
        useWorkoutBlockDraftSession({ syncKey, source }),
      { initialProps: { syncKey: 1, source: sourceA } },
    );

    act(() => {
      result.current.enterEdit();
    });
    act(() => {
      result.current.setDraftTitle('Local draft title');
    });

    rerender({ syncKey: 1, source: sourceB });

    expect(result.current.mode).toBe('edit');
    expect(result.current.draftTitle).toBe('Local draft title');
  });

  it('write-through merges Coach RPE from source into open edit draft', () => {
    const sourceA = sourceFromFormat('emom');
    const main = sourceA.blocks.find((b) => b.section === 'main');
    expect(main).toBeTruthy();
    const sourceB = {
      ...sourceA,
      blocks: sourceA.blocks.map((b) =>
        b.id !== main!.id
          ? b
          : {
              ...b,
              exercises: b.exercises.map((ex) => ({ ...ex, rpe: 7.5 })),
            },
      ),
    };

    const { result, rerender } = renderHook(
      ({ syncKey, source }: UseWorkoutBlockDraftSessionArgs) =>
        useWorkoutBlockDraftSession({ syncKey, source }),
      { initialProps: { syncKey: 1, source: sourceA } },
    );

    act(() => {
      result.current.enterEdit();
    });
    expect(
      result.current.draftBlocks.find((b) => b.id === main!.id)?.exercises[0]?.rpe,
    ).toBeUndefined();
    expect(result.current.isDirty).toBe(false);

    rerender({ syncKey: 1, source: sourceB });

    expect(result.current.mode).toBe('edit');
    const patched = result.current.draftBlocks.find((b) => b.id === main!.id);
    expect(patched?.exercises.every((ex) => ex.rpe === 7.5)).toBe(true);
  });

  it('skips soft write-through and keeps local keystrokes when the draft is dirty', () => {
    const sourceA = sourceFromFormat('emom');
    const main = sourceA.blocks.find((b) => b.section === 'main');
    expect(main).toBeTruthy();
    const sourceB = {
      ...sourceA,
      blocks: sourceA.blocks.map((b) =>
        b.id !== main!.id
          ? b
          : {
              ...b,
              exercises: b.exercises.map((ex) => ({ ...ex, rpe: 7.5 })),
            },
      ),
    };

    const { result, rerender } = renderHook(
      ({ syncKey, source }: UseWorkoutBlockDraftSessionArgs) =>
        useWorkoutBlockDraftSession({ syncKey, source }),
      { initialProps: { syncKey: 1, source: sourceA } },
    );

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('Typing…');
    });
    expect(result.current.isDirty).toBe(true);

    rerender({ syncKey: 1, source: sourceB });

    expect(result.current.mode).toBe('edit');
    expect(result.current.draftTitle).toBe('Typing…');
    expect(
      result.current.draftBlocks.find((b) => b.id === main!.id)?.exercises[0]?.rpe,
    ).toBeUndefined();
  });

  it('refuses structural patches and external blocks while dirty', () => {
    const source = sourceFromFormat('emom');
    const external = sourceFromFormat('tabata').blocks;
    const { result } = renderHook(() => useWorkoutBlockDraftSession({ syncKey: 1, source }));

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('Local edit');
    });

    let appliedExternal = true;
    let appliedPatch = true;
    act(() => {
      appliedExternal = result.current.applyExternalBlocks(external);
      appliedPatch = result.current.applyStructuralPatch([
        { block_id: source.blocks[0]!.id, rpe: 8 },
      ]);
    });
    expect(appliedExternal).toBe(false);
    expect(appliedPatch).toBe(false);
    expect(result.current.draftTitle).toBe('Local edit');
  });

  it('refreshes drafts from source while in view', () => {
    const sourceA = sourceFromFormat('emom');
    const sourceB = {
      ...sourceFromFormat('tabata'),
      title: 'Updated title',
    };

    const { result, rerender } = renderHook(
      ({ syncKey, source }: UseWorkoutBlockDraftSessionArgs) =>
        useWorkoutBlockDraftSession({ syncKey, source }),
      { initialProps: { syncKey: 1, source: sourceA } },
    );

    expect(result.current.mode).toBe('view');
    rerender({ syncKey: 1, source: sourceB });
    expect(result.current.draftTitle).toBe('Updated title');
  });

  it('hard-resets to view when syncKey changes', () => {
    const source = sourceFromFormat('emom');
    const { result, rerender } = renderHook(
      ({ syncKey, source: s }: UseWorkoutBlockDraftSessionArgs) =>
        useWorkoutBlockDraftSession({ syncKey, source: s }),
      { initialProps: { syncKey: 1, source } },
    );

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('Dirty');
    });
    expect(result.current.mode).toBe('edit');

    rerender({ syncKey: 2, source });

    expect(result.current.mode).toBe('view');
    expect(result.current.draftTitle).toBe(source.title);
  });

  it('applyExternalBlocks no-ops in view and replaces in edit', () => {
    const source = sourceFromFormat('emom');
    const external = sourceFromFormat('tabata').blocks;

    const { result } = renderHook(() => useWorkoutBlockDraftSession({ syncKey: 1, source }));

    let applied = false;
    act(() => {
      applied = result.current.applyExternalBlocks(external);
    });
    expect(applied).toBe(false);

    act(() => {
      result.current.enterEdit();
    });
    act(() => {
      applied = result.current.applyExternalBlocks(external);
    });
    expect(applied).toBe(true);
    expect(result.current.draftBlocks.map((b) => b.blockFormat)).toEqual(
      external.map((b) => b.blockFormat),
    );
  });

  it('Preview keeps dirty drafts so Edit can resume them', () => {
    const source = sourceFromFormat('emom');
    const { result } = renderHook(() => useWorkoutBlockDraftSession({ syncKey: 1, source }));

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('In progress');
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.exitToViewKeepDrafts();
    });
    expect(result.current.mode).toBe('view');
    expect(result.current.draftTitle).toBe('In progress');

    act(() => {
      result.current.enterEdit();
    });
    expect(result.current.mode).toBe('edit');
    expect(result.current.draftTitle).toBe('In progress');
  });

  it('isDirty tracks draft edits and clears on cancel', () => {
    const source = sourceFromFormat('emom');
    const { result } = renderHook(() => useWorkoutBlockDraftSession({ syncKey: 1, source }));

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('Changed');
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.cancelEdit();
    });
    expect(result.current.mode).toBe('view');
    expect(result.current.isDirty).toBe(false);
  });

  it('exitEditOnApply false keeps edit; true returns to view', () => {
    const source = sourceFromFormat('emom');
    const onCommit = vi.fn();

    const stay = renderHook(() =>
      useWorkoutBlockDraftSession({ syncKey: 1, source, exitEditOnApply: false }),
    );
    act(() => {
      stay.result.current.enterEdit();
      stay.result.current.applyEdits(onCommit);
    });
    expect(stay.result.current.mode).toBe('edit');
    expect(onCommit).toHaveBeenCalledTimes(1);

    const leave = renderHook(() =>
      useWorkoutBlockDraftSession({ syncKey: 1, source, exitEditOnApply: true }),
    );
    act(() => {
      leave.result.current.enterEdit();
      leave.result.current.applyEdits(onCommit);
    });
    expect(leave.result.current.mode).toBe('view');
  });

  it('applyEdits clears dirty and syncs modeRef so Coach patches can apply again', () => {
    const source = sourceFromFormat('emom');
    const main = source.blocks.find((b) => b.section === 'main');
    expect(main).toBeTruthy();
    const { result } = renderHook(() =>
      useWorkoutBlockDraftSession({ syncKey: 1, source, exitEditOnApply: true }),
    );
    const onCommit = vi.fn();

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('Saved title');
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.applyEdits(onCommit);
    });
    expect(result.current.mode).toBe('view');
    expect(result.current.isDirty).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1);

    // modeRef must be view: applyExternalBlocks / applyStructuralPatch gate on it.
    let appliedWhileView = true;
    act(() => {
      appliedWhileView = result.current.applyExternalBlocks(sourceFromFormat('tabata').blocks);
    });
    expect(appliedWhileView).toBe(false);

    act(() => {
      result.current.enterEdit();
    });
    expect(result.current.isDirty).toBe(false);

    let appliedPatch = false;
    act(() => {
      appliedPatch = result.current.applyStructuralPatch([{ block_id: main!.id, rpe: 8 }]);
    });
    expect(appliedPatch).toBe(true);
  });

  it('applyEdits keeps edit and dirty when onCommit returns false', async () => {
    const source = sourceFromFormat('emom');
    const { result } = renderHook(() =>
      useWorkoutBlockDraftSession({ syncKey: 1, source, exitEditOnApply: true }),
    );

    act(() => {
      result.current.enterEdit();
      result.current.setDraftTitle('Unsaved');
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.applyEdits(() => false);
    });
    expect(result.current.mode).toBe('edit');
    expect(result.current.isDirty).toBe(true);
    expect(result.current.draftTitle).toBe('Unsaved');
  });
});
