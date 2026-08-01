import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { TaskModalTabBar } from '@/components/modals/task-modal/TaskModalTabBar';

describe('TaskModalTabBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps section tabs in tablist and Bubbly as a sibling', () => {
    render(
      <TaskModalTabBar
        tab="details"
        onSelectTab={vi.fn()}
        bubblyProps={{
          count: 0,
          hasMine: false,
          onToggle: vi.fn(),
        }}
      />,
    );

    const tablist = screen.getByRole('tablist', { name: 'Card sections' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(4);
    expect(within(tablist).queryByRole('button', { name: /Bubbly/i })).toBeNull();

    const bubbly = screen.getByRole('button', { name: /Bubbly/i });
    expect(bubbly).toBeTruthy();
    expect(tablist.contains(bubbly)).toBe(false);
  });

  it('renders only the tablist when bubblyProps is null', () => {
    render(<TaskModalTabBar tab="details" onSelectTab={vi.fn()} bubblyProps={null} />);

    expect(screen.getByRole('tablist', { name: 'Card sections' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bubbly/i })).toBeNull();
  });
});
