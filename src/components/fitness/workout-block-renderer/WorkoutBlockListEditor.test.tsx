import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { applyBlockEditsToMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  removeExerciseFromBlock,
  reorderExercisesInBlock,
  appendMainBlock,
  createDefaultMainBlock,
  updateExerciseInBlock,
} from './workout-block-editor-types';
import { applyBlockExerciseDragEnd } from './MainBlockExerciseList';
import { WorkoutBlockListEditor } from './WorkoutBlockListEditor';

function ControlledEditor({
  initialMeta,
  onChangeSpy,
}: {
  initialMeta: Record<string, unknown>;
  onChangeSpy: (blocks: ReturnType<typeof buildWorkoutSessionViewModel>['blocks']) => void;
}) {
  const vm = buildWorkoutSessionViewModel(initialMeta);
  const [blocks, setBlocks] = useState(vm.blocks);

  return (
    <WorkoutBlockListEditor
      blocks={blocks}
      canWrite
      workoutUnitSystem="metric"
      onChange={(next) => {
        setBlocks(next);
        onChangeSpy(next);
      }}
      idPrefix="test"
    />
  );
}

describe('WorkoutBlockListEditor', () => {
  afterEach(() => cleanup());

  it('renders Tabata main header with subtitle', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.getByTestId('workout-block-list-editor')).toBeTruthy();
    expect(screen.getByText('MAIN')).toBeTruthy();
    expect(screen.getByText(/Tabata/i)).toBeTruthy();
  });

  it('fires onChange with updated exercise name while preserving blockFormat', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
        idPrefix="tabata"
      />,
    );

    const mainSection = screen.getByTestId(`editor-main-block-${main.id}`);
    const nameInput = within(mainSection).getByLabelText('Exercise name');
    fireEvent.change(nameInput, { target: { value: 'Burpee Tabata' } });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    const mainNext = next.find((b: { id: string }) => b.id === main.id)!;
    expect(mainNext.exercises[0].exerciseName).toBe('Burpee Tabata');
    expect(mainNext.blockFormat).toBe('tabata');
    expect(mainNext.formatParams).toEqual(main.formatParams);
  });

  it('shows A1 and A2 station labels for superset', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('superset'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('A2')).toBeTruthy();
  });

  it('updates finisher instructions via textarea', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(meta);
    const finisher = vm.blocks.find((b) => b.section === 'finisher')!;
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
        idPrefix="fin"
      />,
    );

    const finSection = screen.getByTestId('editor-instruction-finisher');
    const textarea = within(finSection).getByLabelText('Instructions (one line per bullet)');
    fireEvent.change(textarea, { target: { value: '90s hollow hold' } });

    const next = onChange.mock.calls.at(-1)![0];
    const finNext = next.find((b: { id: string }) => b.id === finisher.id)!;
    expect(finNext.instructions).toEqual(['90s hollow hold']);
  });

  it('removeExerciseFromBlock drops the exercise at the given index', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    expect(main.exercises.length).toBe(3);

    const next = removeExerciseFromBlock(vm.blocks, main.id, 1);
    const mainNext = next.find((b) => b.id === main.id)!;
    expect(mainNext.exercises.length).toBe(2);
    expect(mainNext.exercises.map((e) => e.exerciseName)).toEqual(['Deadlift', 'Air Squat']);
    expect(mainNext.exercises.map((e) => e.order)).toEqual([1, 2]);
  });

  it('removes an exercise via trash control and reduces block exercise count', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
        idPrefix="emom"
      />,
    );

    const mainSection = screen.getByTestId(`editor-main-block-${main.id}`);
    const removeBtn = within(mainSection).getByRole('button', {
      name: /Remove exercise: Push-up/i,
    });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    const mainNext = next.find((b: { id: string }) => b.id === main.id)!;
    expect(mainNext.exercises.length).toBe(2);
    expect(
      mainNext.exercises.some((e: { exerciseName: string }) => e.exerciseName === 'Push-up'),
    ).toBe(false);
  });

  it('round-trips editor onChange through applyBlockEditsToMetadata', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm1 = buildWorkoutSessionViewModel(meta);
    const main = vm1.blocks.find((b) => b.section === 'main')!;
    const onChangeSpy = vi.fn();

    render(<ControlledEditor initialMeta={meta} onChangeSpy={onChangeSpy} />);

    const mainSection = screen.getByTestId(`editor-main-block-${main.id}`);
    const nameInput = within(mainSection).getByLabelText('Exercise name');
    fireEvent.change(nameInput, { target: { value: 'Factory Renamed' } });

    const editedBlocks = onChangeSpy.mock.calls.at(-1)![0];
    const next = applyBlockEditsToMetadata(meta, editedBlocks);
    const vm2 = buildWorkoutSessionViewModel(next);
    const main2 = vm2.blocks.find((b) => b.section === 'main')!;

    expect(main2.blockFormat).toBe('tabata');
    expect(main2.exercises[0].exerciseName).toBe('Factory Renamed');
    expect(main2.formatParams).toEqual(main.formatParams);
  });

  it('adds an exercise via Add exercise button on Tabata block', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
        idPrefix="tabata-add"
      />,
    );

    fireEvent.click(screen.getByTestId(`add-exercise-${main.id}`));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    const mainNext = next.find((b: { id: string }) => b.id === main.id)!;
    expect(mainNext.exercises.length).toBe(main.exercises.length + 1);
    expect(mainNext.exercises.map((e: { order: number }) => e.order)).toEqual([1, 2]);
    expect(mainNext.exercises[1].exerciseName).toBe('');
  });

  it('hides Add exercise on superset at 2-exercise capacity', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('superset'));
    const main = vm.blocks.find((b) => b.section === 'main')!;

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByTestId(`add-exercise-${main.id}`)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add exercise' })).toBeNull();
  });

  it('hides remove trash on superset when at minimum cardinality', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('superset'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /Remove exercise:/i })).toBeNull();
  });

  it('round-trips add exercise through applyBlockEditsToMetadata', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm1 = buildWorkoutSessionViewModel(meta);
    const main = vm1.blocks.find((b) => b.section === 'main')!;
    const onChangeSpy = vi.fn();

    render(<ControlledEditor initialMeta={meta} onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByTestId(`add-exercise-${main.id}`));

    const mainSection = screen.getByTestId(`editor-main-block-${main.id}`);
    const nameInputs = within(mainSection).getAllByLabelText('Exercise name');
    fireEvent.change(nameInputs[1]!, { target: { value: 'Air Squat' } });

    const editedBlocks = onChangeSpy.mock.calls.at(-1)![0];
    const next = applyBlockEditsToMetadata(meta, editedBlocks);
    const vm2 = buildWorkoutSessionViewModel(next);
    const main2 = vm2.blocks.find((b) => b.section === 'main')!;

    expect(main2.exercises.length).toBe(2);
    expect(main2.exercises[1].exerciseName).toBe('Air Squat');
  });

  it('shows drag grips when block has multiple exercises and canWrite', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
        idPrefix="emom-dnd"
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Drag to reorder exercise' })).toHaveLength(3);
  });

  it('hides drag grips when canWrite is false', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite={false}
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Drag to reorder exercise' })).toBeNull();
  });

  it('hides drag grips when block has only one exercise', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Drag to reorder exercise' })).toBeNull();
  });

  it('reorder updates draft immutably via drag-end handler', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const sortIds = ['sort-0', 'sort-1', 'sort-2'];

    const result = applyBlockExerciseDragEnd(sortIds, vm.blocks, main.id, 'sort-2', 'sort-0');
    expect(result).not.toBeNull();
    expect(result!.nextBlocks).not.toBe(vm.blocks);

    const mainNext = result!.nextBlocks.find((b) => b.id === main.id)!;
    expect(mainNext.exercises.map((e) => e.exerciseName)).toEqual([
      'Air Squat',
      'Deadlift',
      'Push-up',
    ]);

    render(
      <WorkoutBlockListEditor
        blocks={result!.nextBlocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
        idPrefix="reorder"
      />,
    );

    const mainSection = screen.getByTestId(`editor-main-block-${main.id}`);
    const nameInputs = within(mainSection).getAllByLabelText('Exercise name') as HTMLInputElement[];
    expect(nameInputs[0]!.value).toBe('Air Squat');
    expect(nameInputs[1]!.value).toBe('Deadlift');
    expect(nameInputs[2]!.value).toBe('Push-up');
  });

  it('round-trips reorder through applyBlockEditsToMetadata', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const reordered = reorderExercisesInBlock(vm.blocks, main.id, 2, 0);

    const next = applyBlockEditsToMetadata(meta, reordered);
    const vm2 = buildWorkoutSessionViewModel(next);
    const main2 = vm2.blocks.find((b) => b.section === 'main')!;

    expect(main2.exercises.map((e) => e.exerciseName)).toEqual([
      'Air Squat',
      'Deadlift',
      'Push-up',
    ]);
  });

  it('shows Add main block when canWrite', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.getByTestId('add-main-block')).toBeTruthy();
  });

  it('hides Add main block when canWrite is false', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite={false}
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByTestId('add-main-block')).toBeNull();
  });

  it('adds a main block via Add main block button', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const onChangeSpy = vi.fn();

    render(<ControlledEditor initialMeta={meta} onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByTestId('add-main-block'));

    expect(onChangeSpy).toHaveBeenCalled();
    const next = onChangeSpy.mock.calls.at(-1)![0];
    expect(next.filter((b: { section: string }) => b.section === 'main')).toHaveLength(2);
  });

  it('hides Remove block when only one main block exists', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByTestId(`remove-main-block-${main.id}`)).toBeNull();
  });

  it('shows Remove block on each main block when multiple exist', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const blocks = appendMainBlock(vm.blocks, createDefaultMainBlock(2));
    const mainIds = blocks.filter((b) => b.section === 'main').map((b) => b.id);

    render(
      <WorkoutBlockListEditor
        blocks={blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    for (const id of mainIds) {
      expect(screen.getByTestId(`remove-main-block-${id}`)).toBeTruthy();
    }
  });

  it('removes a main block via Remove block control', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const blocks = appendMainBlock(vm.blocks, createDefaultMainBlock(2));
    const straightSetsMain = blocks
      .filter((b) => b.section === 'main')
      .find((b) => b.blockFormat === 'straight_sets')!;
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId(`remove-main-block-${straightSetsMain.id}`));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.filter((b: { section: string }) => b.section === 'main')).toHaveLength(1);
  });

  it('shows Split button when exercise name contains a comma', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const blocks = updateExerciseInBlock(vm.blocks, main.id, 0, {
      exerciseName: 'Burpees, Squats',
    });

    render(
      <WorkoutBlockListEditor
        blocks={blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={() => {}}
        idPrefix="split"
      />,
    );

    expect(screen.getByRole('button', { name: 'Split into rows' })).toBeTruthy();
  });

  it('splits comma-separated exercise via Split button', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const blocks = updateExerciseInBlock(vm.blocks, main.id, 0, {
      exerciseName: 'Burpees, Squats',
    });
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
        idPrefix="split"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Split into rows' }));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    const mainNext = next.find((b: { id: string }) => b.id === main.id)!;
    expect(mainNext.exercises).toHaveLength(2);
    expect(mainNext.exercises.map((e: { exerciseName: string }) => e.exerciseName)).toEqual([
      'Burpees',
      'Squats',
    ]);
  });

  it('adds a warm-up section when missing', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const blocks = vm.blocks.filter((b) => b.section !== 'warmup');
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('add-warmup'));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.some((b: { section: string }) => b.section === 'warmup')).toBe(true);
  });

  it('removes an instruction block via Remove block control', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const finisher = vm.blocks.find((b) => b.section === 'finisher')!;
    const onChange = vi.fn();

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite
        workoutUnitSystem="metric"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId(`remove-instruction-${finisher.id}`));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.some((b: { section: string }) => b.section === 'finisher')).toBe(false);
  });

  it('hides instruction add buttons when section exists or read-only', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));

    render(
      <WorkoutBlockListEditor
        blocks={vm.blocks}
        canWrite={false}
        workoutUnitSystem="metric"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByTestId('add-warmup')).toBeNull();
    expect(screen.queryByTestId('add-finisher')).toBeNull();
    expect(screen.queryByTestId('add-cooldown')).toBeNull();
  });
});
