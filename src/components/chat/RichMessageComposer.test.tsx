import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function BlockHarness() {
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
      blockConfig={{
        presets: [
          {
            id: 'finisher-amrap',
            label: 'Finisher · AMRAP',
            section_name: 'Finisher',
            block_format: 'amrap',
            format_params: { time_cap_minutes: 5 },
          },
        ],
      }}
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
    expect(screen.getByText('Finisher · AMRAP')).toBeDefined();
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
