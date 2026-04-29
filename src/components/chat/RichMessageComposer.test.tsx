import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichMessageComposer } from './RichMessageComposer';

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
