import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalExperienceCanvas } from '@/components/modals/task-modal/TaskModalExperienceCanvas';

describe('TaskModalExperienceCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders highlights, includes, good_for, and logistics', () => {
    render(
      <TaskModalExperienceCanvas
        canWrite
        experienceHighlights={['Sunrise views']}
        onExperienceHighlightsChange={() => undefined}
        experienceIncludes={['Certified guide']}
        onExperienceIncludesChange={() => undefined}
        experienceGoodFor={['All levels', 'Outdoors']}
        onExperienceGoodForChange={() => undefined}
        experienceLocation="Eagle Ridge"
        onExperienceLocationChange={() => undefined}
        experienceDurationMin="150"
        onExperienceDurationMinChange={() => undefined}
        experiencePrice="$28"
        onExperiencePriceChange={() => undefined}
        experienceGroupMin="4"
        onExperienceGroupMinChange={() => undefined}
        experienceGroupMax="8"
        onExperienceGroupMaxChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('task-modal-experience-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-experience-highlights').textContent).toMatch(
      /Sunrise views/,
    );
    expect(screen.getByTestId('task-modal-experience-includes').textContent).toMatch(
      /Certified guide/,
    );
    expect(screen.getByTestId('task-modal-experience-good-for').textContent).toMatch(/All levels/);
    expect(screen.getByTestId('task-modal-experience-duration')).toHaveProperty('value', '150');
    expect(screen.getByTestId('task-modal-experience-price')).toHaveProperty('value', '$28');
    expect(screen.getByTestId('task-modal-experience-location')).toHaveProperty(
      'value',
      'Eagle Ridge',
    );
  });

  it('shows empty help when lists are empty', () => {
    render(
      <TaskModalExperienceCanvas
        canWrite={false}
        experienceHighlights={[]}
        onExperienceHighlightsChange={() => undefined}
        experienceIncludes={[]}
        onExperienceIncludesChange={() => undefined}
        experienceGoodFor={[]}
        onExperienceGoodForChange={() => undefined}
        experienceLocation=""
        onExperienceLocationChange={() => undefined}
        experienceDurationMin=""
        onExperienceDurationMinChange={() => undefined}
        experiencePrice=""
        onExperiencePriceChange={() => undefined}
        experienceGroupMin=""
        onExperienceGroupMinChange={() => undefined}
        experienceGroupMax=""
        onExperienceGroupMaxChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('task-modal-experience-highlights-empty')).toBeTruthy();
    expect(screen.getByTestId('task-modal-experience-includes-empty')).toBeTruthy();
    expect(screen.getByTestId('task-modal-experience-good-for-empty')).toBeTruthy();
  });

  it('adds a good_for tag via Add', () => {
    const onGoodFor = vi.fn();
    render(
      <TaskModalExperienceCanvas
        canWrite
        experienceHighlights={[]}
        onExperienceHighlightsChange={() => undefined}
        experienceIncludes={[]}
        onExperienceIncludesChange={() => undefined}
        experienceGoodFor={['All levels']}
        onExperienceGoodForChange={onGoodFor}
        experienceLocation=""
        onExperienceLocationChange={() => undefined}
        experienceDurationMin=""
        onExperienceDurationMinChange={() => undefined}
        experiencePrice=""
        onExperiencePriceChange={() => undefined}
        experienceGroupMin=""
        onExperienceGroupMinChange={() => undefined}
        experienceGroupMax=""
        onExperienceGroupMaxChange={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Add tag…'), { target: { value: 'Outdoors' } });
    fireEvent.click(screen.getByTestId('task-modal-experience-good-for-add'));
    expect(onGoodFor).toHaveBeenCalledWith(['All levels', 'Outdoors']);
  });
});
