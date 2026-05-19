import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BLOCK_PICKER_PRESETS } from '@/lib/agents/coach/block-blueprint-mentions-client';
import { RichMessageComposer } from './RichMessageComposer';

afterEach(() => cleanup());

function HashHarness() {
  const [value, setValue] = useState('');
  return (
    <RichMessageComposer
      value={value}
      onChange={(next) => setValue(next)}
      onSubmit={vi.fn().mockResolvedValue(true)}
      pendingFiles={[]}
      onPendingFilesChange={vi.fn()}
      fileAccept="*"
      canSubmit
      features={{
        enableAtMentions: false,
        enableSlashTaskLinks: false,
        enableExerciseHashMentions: true,
        enableCreateAndAttachCard: false,
        enableStartLiveWorkout: false,
      }}
      hashConfig={{
        exercises: [{ id: '1', name: 'Bulgarian Split Squat' }],
      }}
      formTestId="t-h"
    />
  );
}

function BlockHarness({
  presets = BLOCK_PICKER_PRESETS,
}: {
  presets?: typeof BLOCK_PICKER_PRESETS;
}) {
  const [value, setValue] = useState('');
  return (
    <RichMessageComposer
      value={value}
      onChange={(next) => setValue(next)}
      onSubmit={vi.fn().mockResolvedValue(true)}
      pendingFiles={[]}
      onPendingFilesChange={vi.fn()}
      fileAccept="*"
      canSubmit
      features={{
        enableAtMentions: false,
        enableSlashTaskLinks: false,
        enableExerciseHashMentions: false,
        enableBlockBlueprintMentions: true,
        enableCreateAndAttachCard: false,
        enableStartLiveWorkout: false,
      }}
      blockConfig={{ presets }}
      formTestId="t-colon"
    />
  );
}

describe('RichMessageComposer block trigger', () => {
  it('opens block blueprint popover when typing :', () => {
    render(<BlockHarness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: ':amr', selectionStart: 4 },
    });
    expect(screen.getByText('Block blueprint')).toBeDefined();
    expect(screen.getAllByText(/AMRAP/).length).toBeGreaterThan(0);
  });

  it('shows sticky group headers when query is empty', () => {
    render(<BlockHarness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: ':', selectionStart: 1 },
    });
    expect(screen.getByText('MAIN')).toBeDefined();
    expect(screen.getByText('CONDITIONING & FINISHERS')).toBeDefined();
  });

  it('filters via alias when typing :tab', () => {
    render(<BlockHarness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: ':tab', selectionStart: 4 },
    });
    expect(screen.getAllByText(/Tabata/).length).toBeGreaterThan(0);
    expect(screen.queryByText('MAIN')).toBeNull();
  });

  it('keyboard navigation follows grouped display order', () => {
    render(<BlockHarness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: ':', selectionStart: 1 },
    });

    const highlightedLabel = () => {
      const row = document.querySelector('.bg-primary\\/10.text-primary .font-semibold');
      return row?.textContent ?? null;
    };

    const first = highlightedLabel();
    expect(first).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = highlightedLabel();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toMatch(/^:/);
    expect(input.value.endsWith(' ')).toBe(true);
  });

  it('inserts catalog token on pick', () => {
    const finisherAmrap = BLOCK_PICKER_PRESETS.find((p) => p.id === 'finisher-amrap-metcon');
    expect(finisherAmrap).toBeDefined();
    render(<BlockHarness presets={[finisherAmrap!]} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: ':amr', selectionStart: 4 },
    });
    fireEvent.click(screen.getByText(finisherAmrap!.label));
    expect(input.value).toBe(':finisher/amrap/metcon ');
  });
});

describe('RichMessageComposer hash trigger', () => {
  it('keeps # popover open while typing a multi-word filter', () => {
    render(<HashHarness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: '#bulg', selectionStart: 5 },
    });
    expect(screen.getByText('Tag exercise')).toBeDefined();
    fireEvent.change(input, {
      target: { value: '#bulg sp', selectionStart: 8 },
    });
    expect(screen.getByText('Bulgarian Split Squat')).toBeDefined();
  });
});
